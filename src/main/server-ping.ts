import { resolveSrv } from 'dns/promises'
import { Socket } from 'net'
import type { ServerStatus } from '@shared/types'

/** VarInt из протокола Minecraft */
function varInt(value: number): Buffer {
  const bytes: number[] = []
  let v = value >>> 0
  do {
    let b = v & 0x7f
    v >>>= 7
    if (v !== 0) b |= 0x80
    bytes.push(b)
  } while (v !== 0)
  return Buffer.from(bytes)
}

function readVarInt(buf: Buffer, offset: number): { value: number; size: number } | null {
  let value = 0
  let size = 0
  let byte: number
  do {
    if (offset + size >= buf.length) return null
    byte = buf[offset + size]
    value |= (byte & 0x7f) << (7 * size)
    size++
    if (size > 5) throw new Error('VarInt слишком длинный')
  } while (byte & 0x80)
  return { value, size }
}

function packet(id: number, ...parts: Buffer[]): Buffer {
  const body = Buffer.concat([varInt(id), ...parts])
  return Buffer.concat([varInt(body.length), body])
}

async function resolveAddress(host: string, port?: number): Promise<{ host: string; port: number }> {
  if (port) return { host, port }
  try {
    const [srv] = await resolveSrv(`_minecraft._tcp.${host}`)
    if (srv) return { host: srv.name, port: srv.port }
  } catch {
    // SRV-записи нет — обычный порт
  }
  return { host, port: 25565 }
}

/** MOTD бывает строкой или JSON-компонентом с extra — собираем плоский текст */
function flattenMotd(desc: unknown): string {
  if (typeof desc === 'string') return desc.replace(/§./g, '')
  if (!desc || typeof desc !== 'object') return ''
  const d = desc as { text?: string; extra?: unknown[] }
  return ((d.text ?? '') + (d.extra ?? []).map(flattenMotd).join('')).replace(/§./g, '')
}

/** Server List Ping: handshake → status request → JSON, затем ping/pong для задержки */
export async function pingServer(host: string, port?: number, timeoutMs = 6000): Promise<ServerStatus> {
  const addr = await resolveAddress(host, port)
  return new Promise((resolve) => {
    const socket = new Socket()
    let buf = Buffer.alloc(0)
    let status: ServerStatus | null = null
    let pingSent = 0
    const done = (result: ServerStatus): void => {
      socket.destroy()
      resolve(result)
    }
    socket.setTimeout(timeoutMs, () => done(status ?? { online: false, error: 'Сервер не отвечает' }))
    socket.on('error', (e) => done(status ?? { online: false, error: e.message }))

    socket.connect(addr.port, addr.host, () => {
      const hostBuf = Buffer.from(host, 'utf8')
      const portBuf = Buffer.alloc(2)
      portBuf.writeUInt16BE(addr.port)
      socket.write(packet(0x00, varInt(767), varInt(hostBuf.length), hostBuf, portBuf, varInt(1)))
      socket.write(packet(0x00))
    })

    socket.on('data', (chunk) => {
      buf = Buffer.concat([buf, chunk])
      for (;;) {
        const len = readVarInt(buf, 0)
        if (!len || buf.length < len.size + len.value) return
        const body = buf.subarray(len.size, len.size + len.value)
        buf = buf.subarray(len.size + len.value)
        const id = readVarInt(body, 0)!
        if (id.value === 0x00 && !status) {
          const strLen = readVarInt(body, id.size)!
          const json = JSON.parse(body.subarray(id.size + strLen.size).toString('utf8'))
          status = {
            online: true,
            version: json.version?.name,
            motd: flattenMotd(json.description),
            players: {
              online: json.players?.online ?? 0,
              max: json.players?.max ?? 0,
              sample: (json.players?.sample ?? []).map((p: { name: string }) => p.name).filter((n: string) => /^\w{3,16}$/.test(n))
            },
            favicon: json.favicon
          }
          pingSent = Date.now()
          const payload = Buffer.alloc(8)
          payload.writeBigInt64BE(BigInt(pingSent))
          socket.write(packet(0x01, payload))
        } else if (id.value === 0x01 && status) {
          done({ ...status, ping: Date.now() - pingSent })
        }
      }
    })
  })
}
