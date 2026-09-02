"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Camera, Loader2, Trash2 } from "lucide-react";
import { Avatar } from "@/components/ui";
import { Button } from "@/components/ui/Button";
import { uploadAvatar, removeAvatar } from "@/server/avatar";
import { friendlyError } from "@/lib/actionError";

/**
 * AVATAR YUKLASH.
 *
 * Rasm brauzerda 256px ga KICHRAYTIRILADI va JPEG ga o'tkaziladi. Nega
 * shart: telefondan olingan surat 3–8 MB bo'ladi, ekranda esa u eng katta
 * holida 64px chiziladi. Siqishsiz har yuklash serverga megabaytlab bayt
 * yuborardi va 2 MB chegarasiga tez-tez urilardi — foydalanuvchi esa
 * "rasm juda katta" xabarini ko'rib, uni O'ZI kichraytirishi kerak bo'lardi.
 *
 * Kvadratga qirqish markazdan: portret ham, landshaft ham yuzni markazda
 * saqlaydi va doira ichida cho'zilmaydi.
 */
const TARGET = 256;

function toSquareJpeg(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Faylni o'qib bo'lmadi"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Bu fayl rasm emas"));
      img.onload = () => {
        const side = Math.min(img.width, img.height);
        const canvas = document.createElement("canvas");
        canvas.width = TARGET;
        canvas.height = TARGET;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("Brauzer rasmni qayta chiza olmadi"));
        ctx.drawImage(
          img,
          (img.width - side) / 2,
          (img.height - side) / 2,
          side,
          side,
          0,
          0,
          TARGET,
          TARGET,
        );
        resolve(canvas.toDataURL("image/jpeg", 0.85));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

export function AvatarUploader({
  userId,
  name,
  color,
  avatarRef,
  onChanged,
}: {
  userId: string;
  name: string;
  color?: string | null;
  /** Serverdagi rasm havolasi — o'chirish tugmasi shunga qarab chiziladi. */
  avatarRef?: string | null;
  onChanged?: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  // Yuklangandan keyin `/api/avatar/<id>` eski rasmni keshdan berishi mumkin,
  // shuning uchun yangisi darhol shu yerdan ko'rsatiladi.
  const [preview, setPreview] = useState<string | null>(null);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      const dataUrl = await toSquareJpeg(file);
      await uploadAvatar(userId, dataUrl);
      setPreview(dataUrl);
      toast.success("Rasm yuklandi");
      onChanged?.();
    } catch (e) {
      toast.error(friendlyError(e, "Rasmni yuklab bo'lmadi"));
    } finally {
      setBusy(false);
      // Bir xil faylni qayta tanlash ham `change` hodisasini bersin.
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const drop = async () => {
    setBusy(true);
    try {
      await removeAvatar(userId);
      setPreview(null);
      toast.success("Rasm o'chirildi");
      onChanged?.();
    } catch (e) {
      toast.error(friendlyError(e, "O'chirib bo'lmadi"));
    } finally {
      setBusy(false);
    }
  };

  const showing = preview !== null || Boolean(avatarRef);

  return (
    <div className="flex items-center gap-4">
      <div className="relative shrink-0">
        <Avatar
          name={name}
          color={color}
          userId={userId}
          avatarRef={avatarRef}
          src={preview}
          size="xl"
          className="shadow-md"
        />
        {busy && (
          <span
            className="absolute inset-0 rounded-full flex items-center justify-center"
            style={{ background: "rgba(6,10,15,0.55)" }}
          >
            <Loader2 size={20} className="animate-spin" style={{ color: "var(--text-white)" }} />
          </span>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => pick(e.target.files?.[0])}
        />
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" disabled={busy} onClick={() => inputRef.current?.click()}>
            <Camera size={14} />
            {showing ? "Rasmni almashtirish" : "Rasm yuklash"}
          </Button>
          {showing && (
            <Button variant="ghost" size="sm" disabled={busy} onClick={drop}>
              <Trash2 size={14} />
              O&apos;chirish
            </Button>
          )}
        </div>
        <p className="text-micro" style={{ color: "var(--text-muted)" }}>
          JPG, PNG yoki WEBP. Rasm 256px kvadratga kichraytiriladi.
        </p>
      </div>
    </div>
  );
}

export default AvatarUploader;
