// IDs gerados no próprio caixa (Start Geral 5.4): UUID v7 = 48 bits de tempo em ms + aleatório.
// Ordenam pela hora de criação e não colidem entre caixas que sincronizam depois.

export function uuidv7(agora: number = Date.now(), aleatorio: (n: number) => Uint8Array = bytesAleatorios): string {
  const b = aleatorio(16);
  let t = agora;
  for (let i = 5; i >= 0; i--) {
    b[i] = t % 256;
    t = Math.floor(t / 256);
  }
  b[6] = 0x70 | (b[6]! & 0x0f); // versão 7
  b[8] = 0x80 | (b[8]! & 0x3f); // variante RFC 9562
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

function bytesAleatorios(n: number): Uint8Array {
  return globalThis.crypto.getRandomValues(new Uint8Array(n));
}

export const ehUuid = (s: unknown): s is string => typeof s === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
