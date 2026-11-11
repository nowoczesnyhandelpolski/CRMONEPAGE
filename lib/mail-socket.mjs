function concat(left, right) {
  const out = new Uint8Array(left.length + right.length);
  out.set(left, 0);
  out.set(right, left.length);
  return out;
}

/** Czyta linie i literały IMAP/SMTP z gniazda TCP (cloudflare:sockets). */
export function wrapSocket(socket) {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  let current = socket;
  let reader = current.readable.getReader();
  let writer = current.writable.getWriter();
  let buf = new Uint8Array(0);

  async function fill(min) {
    while (buf.length < min) {
      const { value, done } = await reader.read();
      if (done || !value?.length) throw new Error("Połączenie ze skrzynką zostało zamknięte.");
      buf = concat(buf, value);
    }
  }

  return {
    async write(text) {
      await writer.write(encoder.encode(text));
    },
    async readLine() {
      while (true) {
        let idx = -1;
        for (let i = 0; i < buf.length - 1; i++) {
          if (buf[i] === 13 && buf[i + 1] === 10) { idx = i; break; }
        }
        if (idx >= 0) {
          const line = decoder.decode(buf.slice(0, idx));
          buf = buf.slice(idx + 2);
          return line;
        }
        await fill(buf.length + 1);
      }
    },
    async readBytes(count) {
      await fill(count);
      const out = buf.slice(0, count);
      buf = buf.slice(count);
      return out;
    },
    async startTls() {
      writer.releaseLock();
      reader.releaseLock();
      if (typeof current.startTls !== "function") throw new Error("To połączenie nie obsługuje STARTTLS.");
      current = current.startTls();
      reader = current.readable.getReader();
      writer = current.writable.getWriter();
      buf = new Uint8Array(0);
    },
    async close() {
      try { await writer.close(); } catch { /* już zamknięte */ }
    }
  };
}
