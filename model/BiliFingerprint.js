/**
 * B站反爬 — 浏览器指纹 + MurmurHash3 + dm_img 参数
 *
 * 移植自 yuki-plugin，用于生成 buvid_fp 和设备指纹数据。
 * 算法和常量与 yuki-plugin 完全一致，确保 B站 服务端验证通过。
 */

/**
 * MurmurHash3 x64 128-bit 实现
 * 来源: https://github.com/karanlyons/murmurHash3.js
 * 用于 buvid_fp 计算，算法不可修改
 */
class MurmurHash3 {
  /**
   * 64-bit unsigned addition (two 32-bit halves)
   */
  static x64Add(m, n) {
    const m0 = m[0] >>> 16, m1 = m[0] & 0xffff
    const m2 = m[1] >>> 16, m3 = m[1] & 0xffff
    const n0 = n[0] >>> 16, n1 = n[0] & 0xffff
    const n2 = n[1] >>> 16, n3 = n[1] & 0xffff

    let o0 = m1 + n1
    let carry = o0 >>> 16
    o0 = (o0 & 0xffff) | ((m0 + n0 + carry) << 16)

    let o1 = m3 + n3
    carry = o1 >>> 16
    o1 = (o1 & 0xffff) | ((m2 + n2 + carry) << 16)

    return [o0 >>> 0, o1 >>> 0]
  }

  static x64Multiply(m, n) {
    const m0 = m[0] >>> 16, m1 = m[0] & 0xffff
    const m2 = m[1] >>> 16, m3 = m[1] & 0xffff
    const n0 = n[0] >>> 16, n1 = n[0] & 0xffff
    const n2 = n[1] >>> 16, n3 = n[1] & 0xffff

    let o0 = m1 * n1
    let o1 = o0 >>> 16
    o0 = o0 & 0xffff
    o1 += m0 * n1 + m1 * n0
    o1 = o1 & 0xffff

    let o2 = o1 >>> 16
    o1 = (o1 & 0xffff) + m3 * n2 + m2 * n3
    o1 = o1 & 0xffff
    o2 += o1 >>> 16
    o2 += m2 * n2
    o2 += m0 * n3 + m3 * n0
    o2 = o2 & 0xffff

    return [
      ((o2 << 16) | (o1 & 0xffff)) >>> 0,
      ((o0 & 0xffff) | ((o1 & 0xffff) << 16)) >>> 0,
    ]
  }

  static x64Rotl(m, n) {
    n %= 64
    if (n === 32) return [m[1], m[0]]
    else if (n < 32) return [
      (m[0] << n) | (m[1] >>> (32 - n)),
      (m[1] << n) | (m[0] >>> (32 - n)),
    ]
    else {
      n -= 32
      return [
        (m[1] << n) | (m[0] >>> (32 - n)),
        (m[0] << n) | (m[1] >>> (32 - n)),
      ]
    }
  }

  static x64LeftShift(m, n) {
    n %= 64
    if (n === 0) return m
    else if (n < 32) return [
      (m[0] << n) | (m[1] >>> (32 - n)),
      (m[1] << n),
    ]
    else return [
      (m[1] << (n - 32)),
      0,
    ]
  }

  static x64Xor(m, n) {
    return [(m[0] ^ n[0]) >>> 0, (m[1] ^ n[1]) >>> 0]
  }

  static x64Fmix(h) {
    h = this.x64Xor(h, [0, h[0] >>> 1])
    h = this.x64Multiply(h, [0xff51afd7, 0xed558ccd])
    h = this.x64Xor(h, [0, h[0] >>> 1])
    h = this.x64Multiply(h, [0xc4ceb9fe, 0x1a85ec53])
    h = this.x64Xor(h, [0, h[0] >>> 1])
    return h
  }

  /**
   * 计算 128-bit MurmurHash3 x64
   * @param {string} key - 输入字符串
   * @param {number} seed - 种子值
   * @returns {string} 32 字符十六进制
   */
  static x64hash128(key, seed) {
    key = String(key)
    const remainder = key.length % 16
    const blocks = (key.length - remainder) / 16

    const c1 = [0x87c37b91, 0x114253d5]
    const c2 = [0x4cf5ad43, 0x2745937f]

    let h1 = [0, seed >>> 0]
    let h2 = [0, seed >>> 0]

    for (let i = 0; i < blocks; i++) {
      const offset = i * 16
      let k1 = [
        (key.charCodeAt(offset + 4) & 0xff) |
        ((key.charCodeAt(offset + 5) & 0xff) << 8) |
        ((key.charCodeAt(offset + 6) & 0xff) << 16) |
        ((key.charCodeAt(offset + 7) & 0xff) << 24),
        (key.charCodeAt(offset) & 0xff) |
        ((key.charCodeAt(offset + 1) & 0xff) << 8) |
        ((key.charCodeAt(offset + 2) & 0xff) << 16) |
        ((key.charCodeAt(offset + 3) & 0xff) << 24),
      ]
      let k2 = [
        (key.charCodeAt(offset + 12) & 0xff) |
        ((key.charCodeAt(offset + 13) & 0xff) << 8) |
        ((key.charCodeAt(offset + 14) & 0xff) << 16) |
        ((key.charCodeAt(offset + 15) & 0xff) << 24),
        (key.charCodeAt(offset + 8) & 0xff) |
        ((key.charCodeAt(offset + 9) & 0xff) << 8) |
        ((key.charCodeAt(offset + 10) & 0xff) << 16) |
        ((key.charCodeAt(offset + 11) & 0xff) << 24),
      ]

      k1 = this.x64Multiply(k1, c1)
      k1 = this.x64Rotl(k1, 31)
      k1 = this.x64Multiply(k1, c2)
      h1 = this.x64Xor(h1, k1)

      h1 = this.x64Rotl(h1, 27)
      h1 = this.x64Add(h1, h2)
      h1 = this.x64Add(this.x64Multiply(h1, [0, 5]), [0, 0x52dce729])

      k2 = this.x64Multiply(k2, c2)
      k2 = this.x64Rotl(k2, 33)
      k2 = this.x64Multiply(k2, c1)
      h2 = this.x64Xor(h2, k2)

      h2 = this.x64Rotl(h2, 31)
      h2 = this.x64Add(h2, h1)
      h2 = this.x64Add(this.x64Multiply(h2, [0, 5]), [0, 0x38495ab5])
    }

    let k1 = [0, 0]
    let k2 = [0, 0]

    switch (remainder) {
      case 15: k2 = this.x64Xor(k2, this.x64LeftShift([0, key.charCodeAt(blocks * 16 + 14)], 48)); /* falls through */
      case 14: k2 = this.x64Xor(k2, this.x64LeftShift([0, key.charCodeAt(blocks * 16 + 13)], 40)); /* falls through */
      case 13: k2 = this.x64Xor(k2, this.x64LeftShift([0, key.charCodeAt(blocks * 16 + 12)], 32)); /* falls through */
      case 12: k2 = this.x64Xor(k2, this.x64LeftShift([0, key.charCodeAt(blocks * 16 + 11)], 24)); /* falls through */
      case 11: k2 = this.x64Xor(k2, this.x64LeftShift([0, key.charCodeAt(blocks * 16 + 10)], 16)); /* falls through */
      case 10: k2 = this.x64Xor(k2, this.x64LeftShift([0, key.charCodeAt(blocks * 16 + 9)], 8)); /* falls through */
      case 9:  k2 = this.x64Xor(k2, [0, key.charCodeAt(blocks * 16 + 8)]); k2 = this.x64Multiply(k2, c2); k2 = this.x64Rotl(k2, 33); k2 = this.x64Multiply(k2, c1); h2 = this.x64Xor(h2, k2); /* falls through */
      case 8:  k1 = this.x64Xor(k1, this.x64LeftShift([0, key.charCodeAt(blocks * 16 + 7)], 56)); /* falls through */
      case 7:  k1 = this.x64Xor(k1, this.x64LeftShift([0, key.charCodeAt(blocks * 16 + 6)], 48)); /* falls through */
      case 6:  k1 = this.x64Xor(k1, this.x64LeftShift([0, key.charCodeAt(blocks * 16 + 5)], 40)); /* falls through */
      case 5:  k1 = this.x64Xor(k1, this.x64LeftShift([0, key.charCodeAt(blocks * 16 + 4)], 32)); /* falls through */
      case 4:  k1 = this.x64Xor(k1, this.x64LeftShift([0, key.charCodeAt(blocks * 16 + 3)], 24)); /* falls through */
      case 3:  k1 = this.x64Xor(k1, this.x64LeftShift([0, key.charCodeAt(blocks * 16 + 2)], 16)); /* falls through */
      case 2:  k1 = this.x64Xor(k1, this.x64LeftShift([0, key.charCodeAt(blocks * 16 + 1)], 8)); /* falls through */
      case 1:  k1 = this.x64Xor(k1, [0, key.charCodeAt(blocks * 16)]); k1 = this.x64Multiply(k1, c1); k1 = this.x64Rotl(k1, 31); k1 = this.x64Multiply(k1, c2); h1 = this.x64Xor(h1, k1);
    }

    h1 = this.x64Xor(h1, [0, key.length])
    h2 = this.x64Xor(h2, [0, key.length])

    h1 = this.x64Add(h1, h2)
    h2 = this.x64Add(h2, h1)

    h1 = this.x64Fmix(h1)
    h2 = this.x64Fmix(h2)

    h1 = this.x64Add(h1, h2)
    h2 = this.x64Add(h2, h1)

    return (
      ('00000000' + (h1[0] >>> 0).toString(16)).slice(-8) +
      ('00000000' + (h1[1] >>> 0).toString(16)).slice(-8) +
      ('00000000' + (h2[0] >>> 0).toString(16)).slice(-8) +
      ('00000000' + (h2[1] >>> 0).toString(16)).slice(-8)
    )
  }
}

/** 浏览器指纹数据集（33 维特征，与 yuki-plugin 一致，不可修改） */
const FP_COMPONENTS = [
  { key: 'userAgent' },
  { key: 'webdriver' },
  { key: 'language' },
  { key: 'colorDepth' },
  { key: 'deviceMemory' },
  { key: 'pixelRatio' },
  { key: 'hardwareConcurrency' },
  { key: 'screenResolution' },
  { key: 'availableScreenResolution' },
  { key: 'timezoneOffset' },
  { key: 'timezone' },
  { key: 'sessionStorage' },
  { key: 'localStorage' },
  { key: 'indexedDb' },
  { key: 'addBehavior' },
  { key: 'openDatabase' },
  { key: 'cpuClass' },
  { key: 'platform' },
  { key: 'doNotTrack' },
  { key: 'plugins' },
  { key: 'canvas' },
  { key: 'webgl' },
  { key: 'webglVendorAndRenderer' },
  { key: 'adBlock' },
  { key: 'hasLiedLanguages' },
  { key: 'hasLiedResolution' },
  { key: 'hasLiedOs' },
  { key: 'hasLiedBrowser' },
  { key: 'touchSupport' },
  { key: 'fonts' },
  { key: 'fontsFlash' },
  { key: 'audio' },
  { key: 'enumerateDevices' },
]

/**
 * 构建浏览器指纹数据对象
 * @param {string} _uuid - 设备 UUID
 * @returns {object} 完整指纹数据
 */
function buildFingerprintData(_uuid) {
  return {
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36',
    webdriver: false,
    language: 'zh-CN',
    colorDepth: 24,
    deviceMemory: 'not available',
    pixelRatio: 2,
    hardwareConcurrency: 8,
    screenResolution: '1920x1200',
    availableScreenResolution: '1920x1152',
    timezoneOffset: -480,
    timezone: 'Asia/Shanghai',
    sessionStorage: true,
    localStorage: true,
    indexedDb: true,
    addBehavior: false,
    openDatabase: false,
    cpuClass: 'not available',
    platform: 'Win32',
    doNotTrack: null,
    plugins: [
      { name: 'PDF Viewer', description: 'Portable Document Format' },
      { name: 'Chrome PDF Viewer', description: 'Portable Document Format' },
      { name: 'Chromium PDF Viewer', description: 'Portable Document Format' },
      { name: 'Microsoft Edge PDF Viewer', description: 'Portable Document Format' },
      { name: 'WebKit built-in PDF', description: 'Portable Document Format' },
    ],
    canvas: 'f3YAAAAASUVORK5CYII=',
    webgl: 'kABYpRAGAVYzWJooB9Bf4P+UortSvxRY0AAAAASUVORK5CYII=',
    webglVendorAndRenderer: 'Google Inc. (Intel)~ANGLE (Intel, Intel(R) HD Graphics Direct3D11 vs_5_0 ps_5_0), or similar',
    adBlock: false,
    hasLiedLanguages: false,
    hasLiedResolution: false,
    hasLiedOs: false,
    hasLiedBrowser: false,
    touchSupport: 0,
    fonts: [
      'Arial', 'Arial Black', 'Calibri', 'Cambria', 'Cambria Math',
      'Comic Sans MS', 'Consolas', 'Courier', 'Courier New', 'Georgia',
      'Helvetica', 'Impact', 'Lucida Console', 'Lucida Sans Unicode',
      'Microsoft Sans Serif', 'MS Gothic', 'MS PGothic', 'MS Sans Serif',
      'MS Serif', 'Palatino Linotype', 'Segoe Print', 'Segoe Script',
      'Segoe UI', 'Segoe UI Light', 'Segoe UI Symbol', 'Tahoma', 'Times',
      'Times New Roman', 'Trebuchet MS', 'Verdana', 'Wingdings',
    ],
    fontsFlash: false,
    audio: '35.749972093850374',
    enumerateDevices: [
      `id=${_uuid};gid=groupId1;kind=videoinput;label=Camera1`,
      `id=${_uuid};gid=groupId2;kind=audioinput;label=Microphone1`,
    ],
  }
}

/**
 * 生成 buvid_fp
 * 将 33 维浏览器指纹用 `~~~` 拼接，计算 MurmurHash3 x64 128-bit（seed=31）
 *
 * @param {string} _uuid - 设备 UUID（用于 enumerateDevices）
 * @returns {string} 32 字符十六进制指纹
 */
function genBuvidFp(_uuid) {
  const data = buildFingerprintData(_uuid)
  const values = FP_COMPONENTS.map(c => {
    let v = data[c.key]
    if (Array.isArray(v)) v = v.map(x => typeof x === 'object' ? (x.name || '') : String(x)).join(',')
    return String(v)
  })
  return MurmurHash3.x64hash128(values.join('~~~'), 31)
}

export { MurmurHash3, buildFingerprintData, genBuvidFp }
