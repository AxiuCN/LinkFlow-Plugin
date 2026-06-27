#!/usr/bin/env python3
"""
media_parser HTTP 微服务
import 同级 astrbot_plugin_media_parser 子模块，提供 /parse /download /health 接口
供 LinkFlow-Plugin (Node.js) 通过 HTTP 调用
"""

import sys
import os
import json
import asyncio
import logging
import argparse

# 将同级 astrbot_plugin_media_parser 加入 sys.path
_THIS_DIR = os.path.dirname(os.path.abspath(__file__))
_SUBMODULE_DIR = os.path.join(_THIS_DIR, "astrbot_plugin_media_parser")
if os.path.isdir(_SUBMODULE_DIR):
    sys.path.insert(0, _SUBMODULE_DIR)

from aiohttp import web

# ============================================================
# 日志
# ============================================================
_LOG_FILE = os.path.join(_THIS_DIR, "server.log")
_logger = logging.getLogger("media_parser_server")
_logger.setLevel(logging.INFO)

_file_handler = logging.FileHandler(_LOG_FILE, encoding="utf-8")
_file_handler.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(message)s"))
_logger.addHandler(_file_handler)

_stream_handler = logging.StreamHandler()
_stream_handler.setFormatter(logging.Formatter("[media_parser] %(message)s"))
_logger.addHandler(_stream_handler)

# ============================================================
# 解析器 & 下载器
# ============================================================

_parser_manager = None
_download_manager = None
_ffmpeg_path = None
_activated_platforms = []


def _discover_parser_classes():
    """
    自动发现 core.parser.platform 中的解析器类
    参考 run_local.py 的 discover_local_parser_classes
    """
    import pkgutil
    import importlib
    from core.parser.platform.base import BaseVideoParser

    PARSER_DISCOVERY_ORDER = [
        "bilibili", "douyin", "tiktok", "kuaishou", "weibo",
        "xiaohongshu", "xianyu", "toutiao", "xiaoheihe", "twitter",
    ]

    package = importlib.import_module("core.parser.platform")
    classes = {}

    for importer, modname, ispkg in pkgutil.iter_modules(package.__path__):
        if modname in ("base", "short_video_shared"):
            continue
        try:
            mod = importlib.import_module(f"core.parser.platform.{modname}")
            for attr_name in dir(mod):
                attr = getattr(mod, attr_name)
                if (isinstance(attr, type)
                        and issubclass(attr, BaseVideoParser)
                        and attr is not BaseVideoParser
                        and not getattr(attr, "__abstractmethods__", None)):
                    classes[modname] = attr
        except Exception as e:
            _logger.warning(f"加载解析器 {modname} 失败: {e}")

    # 按优先级排序
    ordered = []
    for name in PARSER_DISCOVERY_ORDER:
        if name in classes:
            ordered.append((name, classes[name]))
    for name, cls in classes.items():
        if name not in PARSER_DISCOVERY_ORDER:
            ordered.append((name, cls))

    return ordered


def _build_parser_kwargs(parser_class, cookie_runtime_file=None):
    """
    根据 parser __init__ 签名注入已知参数
    参考 run_local.py 的 _build_local_parser_kwargs
    """
    import inspect

    known_kwargs = {
        "cookie_runtime_enabled": cookie_runtime_file is not None,
        "cookie_runtime_file": cookie_runtime_file,
        "use_proxy": False,
        "proxy_url": None,
        "output_mode": "all",
        "cache_dir_available": True,
    }

    sig = inspect.signature(parser_class.__init__)
    kwargs = {}
    for param_name, param in sig.parameters.items():
        if param_name in ("self",):
            continue
        if param_name in known_kwargs:
            kwargs[param_name] = known_kwargs[param_name]
        # 有默认值的参数不强制注入
    return kwargs


async def init_managers(ffmpeg_path=None, cookie_file=None):
    """
    初始化 ParserManager 和 DownloadManager
    """
    global _parser_manager, _download_manager, _ffmpeg_path, _activated_platforms

    _ffmpeg_path = ffmpeg_path

    # 设置 ffmpeg 路径（如果指定）
    if ffmpeg_path and os.path.isfile(ffmpeg_path):
        os.environ["FFMPEG_PATH"] = ffmpeg_path
        _logger.info(f"ffmpeg 路径: {ffmpeg_path}")

    # 发现并实例化解析器
    from core.parser import ParserManager
    from core.downloader import DownloadManager

    discovered = _discover_parser_classes()
    parsers = []
    _activated_platforms = []

    for name, cls in discovered:
        try:
            kwargs = _build_parser_kwargs(cls, cookie_runtime_file=cookie_file)
            parser = cls(**kwargs)
            parsers.append(parser)
            _activated_platforms.append(name)
            _logger.info(f"解析器已加载: {name}")
        except Exception as e:
            _logger.warning(f"解析器实例化失败 {name}: {e}")

    _parser_manager = ParserManager(parsers)
    _download_manager = DownloadManager(
        max_video_size_mb=0.0,
        large_video_threshold_mb=0.0,
        cache_dir=os.path.join(_THIS_DIR, "cache"),
        cache_dir_available=True,
        max_concurrent_downloads=3,
    )

    _logger.info(f"初始化完成，已启用平台: {', '.join(_activated_platforms)}")


# ============================================================
# HTTP 接口
# ============================================================

async def handle_health(request):
    """GET /health — 健康检查 + 已启用平台列表"""
    return web.json_response({
        "status": "ok",
        "platforms": _activated_platforms,
    })


async def handle_parse(request):
    """
    POST /parse — 解析文本中的链接
    请求: {"text": "...", "cookie": "..."}
    响应: [{url, title, author, video_urls, image_urls, ...}, ...]
    """
    if not _parser_manager:
        return web.json_response({"error": "parser not initialized"}, status=503)

    try:
        body = await request.json()
    except Exception:
        return web.json_response({"error": "invalid json"}, status=400)

    text = body.get("text", "")
    cookie_str = body.get("cookie", "")

    if not text:
        return web.json_response({"error": "text is required"}, status=400)

    try:
        links_with_parser = _parser_manager.extract_all_links(text)

        async with _make_session(cookie_str) as session:
            metadata_list = await _parser_manager.parse_text(
                text, session, links_with_parser=links_with_parser
            )

        # 序列化：将 MediaMetadata 对象转为可 JSON 化的 dict
        results = []
        for meta in metadata_list:
            serialized = _serialize_metadata(meta)
            # 防御性修复: url为空时回退source_url
            if not serialized.get("url"):
                fallback = serialized.get("source_url", "")
                if fallback:
                    serialized["url"] = fallback
            if not serialized.get("source_url"):
                serialized["source_url"] = serialized.get("url", "")
            vurls = serialized.get("video_urls", [])
            iurls = serialized.get("image_urls", [])
            _logger.info(
                f"parse 序列化: url={serialized.get('url','')[:80]}, "
                f"title={serialized.get('title','')[:30]}, "
                f"video_urls={len(vurls)}组({[len(g) for g in vurls]}), "
                f"image_urls={len(iurls)}组({[len(g) for g in iurls]})"
                + (f", error={serialized.get('error','')[:60]}" if serialized.get("error") else "")
            )
            results.append(serialized)

        return web.json_response(results)
    except Exception as e:
        _logger.error(f"parse 错误: {e}", exc_info=True)
        return web.json_response({"error": str(e)}, status=500)


async def handle_download(request):
    """
    POST /download — 下载解析后的媒体
    请求: {"metadata": {...}, "max_size_mb": 100, "cookie": "..."}
    响应: {file_paths, video_modes, video_sizes, ...}
    """
    if not _download_manager:
        return web.json_response({"error": "downloader not initialized"}, status=503)

    try:
        body = await request.json()
    except Exception:
        return web.json_response({"error": "invalid json"}, status=400)

    metadata = body.get("metadata", {})
    max_size_mb = body.get("max_size_mb", 0)
    cookie_str = body.get("cookie", "")

    if not metadata:
        return web.json_response({"error": "metadata is required"}, status=400)

    # 防御性修复: 补齐解析阶段可能缺失的关键字段
    if not metadata.get("url"):
        fallback_url = metadata.get("source_url", "")
        if fallback_url:
            _logger.info(f"download url为空，回退source_url: {fallback_url[:80]}")
            metadata["url"] = fallback_url
    if not metadata.get("source_url"):
        metadata["source_url"] = metadata.get("url", "")

    vurls = metadata.get("video_urls", [])
    iurls = metadata.get("image_urls", [])
    _logger.info(
        f"download 收到metadata: url={metadata.get('url','')[:80]}, "
        f"title={metadata.get('title','')[:30]}, "
        f"video_urls={len(vurls)}组({[len(g) for g in vurls]}), "
        f"image_urls={len(iurls)}组({[len(g) for g in iurls]}), "
        f"max_size_mb={max_size_mb}"
        + (f", error={metadata.get('error','')[:60]}" if metadata.get("error") else "")
    )

    # 如果指定了 max_size_mb，临时修改下载管理器设置
    original_max = _download_manager.max_video_size_mb
    if max_size_mb > 0:
        _download_manager.max_video_size_mb = float(max_size_mb)

    try:
        async with _make_session(cookie_str) as session:
            result = await _download_manager.process_metadata(session, metadata)

        return web.json_response(_serialize_download_result(result))
    except Exception as e:
        _logger.error(f"download 错误: {e}", exc_info=True)
        return web.json_response({"error": str(e)}, status=500)
    finally:
        _download_manager.max_video_size_mb = original_max


# ============================================================
# 辅助函数
# ============================================================

def _make_session(cookie_str=""):
    """创建带 Cookie 的 aiohttp.ClientSession"""
    import aiohttp

    headers = {}
    if cookie_str:
        headers["Cookie"] = cookie_str

    return aiohttp.ClientSession(headers=headers)


def _serialize_metadata(meta):
    """将 MediaMetadata 转为可 JSON 化的 dict"""
    if isinstance(meta, dict):
        return meta

    # 尝试转为 dict（MediaMetadata 可能是 dataclass）
    if hasattr(meta, "__dict__"):
        result = {}
        for k, v in meta.__dict__.items():
            if k.startswith("_"):
                continue
            result[k] = _json_safe(v)
        return result

    return {"raw": str(meta)}


def _serialize_download_result(result):
    """将下载结果转为可 JSON 化的 dict"""
    if isinstance(result, dict):
        return {k: _json_safe(v) for k, v in result.items()}
    if hasattr(result, "__dict__"):
        return {k: _json_safe(v) for k, v in result.__dict__.items() if not k.startswith("_")}
    return {"raw": str(result)}


def _json_safe(val):
    """递归确保值可 JSON 序列化"""
    if val is None or isinstance(val, (bool, int, float, str)):
        return val
    if isinstance(val, bytes):
        return val.decode("utf-8", errors="replace")
    if isinstance(val, (list, tuple)):
        return [_json_safe(v) for v in val]
    if isinstance(val, dict):
        return {str(k): _json_safe(v) for k, v in val.items()}
    if hasattr(val, "__dict__"):
        return _json_safe(val.__dict__)
    return str(val)


# ============================================================
# 入口
# ============================================================

def main():
    parser = argparse.ArgumentParser(description="media_parser HTTP server")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=19810)
    parser.add_argument("--ffmpeg-path", default=None, help="ffmpeg 可执行文件路径")
    parser.add_argument("--cookie-file", default=None, help="B站 Cookie 文件路径（Netscape 格式）")
    args = parser.parse_args()

    app = web.Application()
    app.router.add_get("/health", handle_health)
    app.router.add_post("/parse", handle_parse)
    app.router.add_post("/download", handle_download)

    async def on_startup(app):
        await init_managers(
            ffmpeg_path=args.ffmpeg_path,
            cookie_file=args.cookie_file,
        )
        _logger.info(f"media_parser 服务启动: http://{args.host}:{args.port}")

    async def on_cleanup(app):
        if _download_manager:
            await _download_manager.shutdown()

    app.on_startup.append(on_startup)
    app.on_cleanup.append(on_cleanup)

    web.run_app(app, host=args.host, port=args.port, print=None)


if __name__ == "__main__":
    main()
