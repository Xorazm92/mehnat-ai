// Dalil ombori — mazmun-adreslik va path traversal himoyasi.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDiskEvidenceStore, refToPath, extForMime, sha256Of } from "@/lib/engines/evidence/store";

let root = "";
const at = (iso: string) => () => new Date(iso);

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "asro-evidence-"));
});
afterAll(async () => {
  if (root) await rm(root, { recursive: true, force: true });
});

describe("put / get", () => {
  it("baytlarni yozadi va aynan qaytaradi", async () => {
    const store = createDiskEvidenceStore(root, at("2026-08-07T00:00:00Z"));
    const bytes = Buffer.from("skrinshot baytlari");
    const put = await store.put(bytes, "image/jpeg");

    expect(put.storageRef).toMatch(/^disk:\/\/2026\/08\/[a-f0-9]{64}\.jpg$/);
    expect(put.sha256).toBe(sha256Of(bytes));
    expect(put.byteSize).toBe(bytes.byteLength);

    const got = await store.get(put.storageRef);
    expect(got.bytes.equals(bytes)).toBe(true);
  });

  it("mazmun-adresli: bir xil baytlar bir xil yo'l, ikki marta yuklash bepul", async () => {
    const store = createDiskEvidenceStore(root, at("2026-08-07T00:00:00Z"));
    const bytes = Buffer.from("aynan bir xil");
    const a = await store.put(bytes, "image/png");
    const b = await store.put(bytes, "image/png");
    expect(a.storageRef).toBe(b.storageRef);
    expect((await readFile(refToPath(root, a.storageRef))).equals(bytes)).toBe(true);
  });

  it("boshqa baytlar — boshqa yo'l", async () => {
    const store = createDiskEvidenceStore(root, at("2026-08-07T00:00:00Z"));
    const a = await store.put(Buffer.from("bir"), "application/pdf");
    const b = await store.put(Buffer.from("ikki"), "application/pdf");
    expect(a.storageRef).not.toBe(b.storageRef);
  });

  it("head mavjud faylni tasdiqlaydi, yo'qiga null", async () => {
    const store = createDiskEvidenceStore(root, at("2026-08-07T00:00:00Z"));
    const put = await store.put(Buffer.from("head sinovi"), "image/webp");
    expect(await store.head(put.storageRef)).toEqual({ sha256: put.sha256, byteSize: put.byteSize });

    const absent = `disk://2026/08/${"f".repeat(64)}.webp`;
    expect(await store.head(absent)).toBeNull();
  });

  it("noma'lum MIME .bin ga tushadi — yozuv yo'qolmaydi", () => {
    expect(extForMime("application/x-nimadir")).toBe("bin");
    expect(extForMime("image/JPEG; charset=x")).toBe("jpg");
  });
});

describe("path traversal", () => {
  // Ikki qatlamli himoya: qat'iy regex + yechilgan yo'l ildiz ichida ekani.
  // Bittasi yetarli emas — regex kelajakda yumshatilishi mumkin.
  const attacks = [
    "disk://../../etc/passwd",
    "disk://2026/08/../../../etc/passwd.jpg",
    "disk:///etc/passwd",
    "/etc/passwd",
    "disk://2026/08/nothex.jpg",
    "disk://2026/8/" + "a".repeat(64) + ".jpg",
    "disk://2026/08/" + "a".repeat(63) + ".jpg",
    "file://2026/08/" + "a".repeat(64) + ".jpg",
    "disk://2026/08/" + "a".repeat(64) + ".jpg/../../../etc/passwd",
  ];

  for (const ref of attacks) {
    it(`rad etadi: ${ref}`, () => {
      expect(() => refToPath(root, ref)).toThrow();
    });
  }

  it("to'g'ri havolani qabul qiladi", () => {
    const ok = `disk://2026/08/${"a".repeat(64)}.jpg`;
    expect(refToPath(root, ok).startsWith(root)).toBe(true);
  });

  it("get ham himoyalangan, faqat refToPath emas", async () => {
    const store = createDiskEvidenceStore(root);
    await expect(store.get("disk://../../etc/passwd")).rejects.toThrow(/Yaroqsiz/);
  });
});
