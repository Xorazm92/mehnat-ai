"use client";

// BILDIRISHNOMA OVOZI
//
// Qo'ng'iroqdagi qizil nuqta ko'pincha e'tibordan chetda qolardi — endi
// o'qilmaganlar soni OSHGANDA qisqa signal chalinadi.
//
// Uchta nozik joy bor:
//
//  1) `useAutoRefresh` har 15 soniyada `router.refresh()` qiladi, ya'ni
//     `unreadCount` bir xil qiymat bilan qayta-qayta keladi. Shu sababli
//     ovoz FAQAT o'sish bo'lganda chalinadi, har yangilanishda emas.
//
//  2) Birinchi renderda hech qachon chalinmaydi: sahifani ochganda 5 ta
//     o'qilmagan xabar borligi "yangi xabar keldi" degani emas.
//
//  3) Brauzer autoplay siyosati: foydalanuvchi sahifa bilan hech
//     ta'sirlashmagan bo'lsa `play()` rad etiladi. Birinchi `pointerdown`
//     da ovoz jim ijro etilib "ochib qo'yiladi"; rad etilsa jim yutiladi —
//     ovoz yo'qligi ish oqimini to'xtatmasligi kerak.

import { useEffect, useRef } from "react";

const SOUND_SRC = "/sounds/notify.mp3";

/** localStorage kaliti — ovozni foydalanuvchi o'zi o'chira oladi. */
export const NOTIFY_SOUND_KEY = "asro.notifySound";

export function isNotifySoundEnabled(): boolean {
  if (typeof window === "undefined") return false;
  // Standart holat — yoqilgan; faqat aniq "0" o'chiradi.
  return window.localStorage.getItem(NOTIFY_SOUND_KEY) !== "0";
}

export function setNotifySoundEnabled(enabled: boolean): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(NOTIFY_SOUND_KEY, enabled ? "1" : "0");
}

/**
 * @param unreadCount serverdan kelgan o'qilmaganlar soni
 * @param enabled     ovoz yoqilganmi (holat tashqarida boshqariladi, chunki
 *                    uni tugma ham o'zgartiradi)
 */
export function useNotificationSound(unreadCount: number, enabled: boolean): void {
  const previousCount = useRef<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const unlockedRef = useRef(false);

  // Audio obyektini bir marta yaratamiz va birinchi foydalanuvchi harakatida
  // "ochamiz" (autoplay siyosati talab qiladi).
  useEffect(() => {
    if (typeof window === "undefined") return;

    const audio = new Audio(SOUND_SRC);
    audio.preload = "auto";
    audio.volume = 0.4;
    audioRef.current = audio;

    const unlock = () => {
      if (unlockedRef.current) return;
      unlockedRef.current = true;
      const previousVolume = audio.volume;
      audio.volume = 0;
      audio
        .play()
        .then(() => {
          audio.pause();
          audio.currentTime = 0;
        })
        .catch(() => {
          // Ruxsat berilmadi — keyingi urinishda yana harakat qilamiz.
          unlockedRef.current = false;
        })
        .finally(() => {
          audio.volume = previousVolume;
        });
    };

    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });

    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      audio.pause();
      audioRef.current = null;
    };
  }, []);

  useEffect(() => {
    const previous = previousCount.current;
    previousCount.current = unreadCount;

    // Birinchi render — solishtiradigan qiymat yo'q.
    if (previous === null) return;
    if (unreadCount <= previous) return;
    if (!enabled) return;

    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = 0;
    void audio.play().catch(() => {
      // Autoplay rad etildi yoki fayl yuklanmadi — jim o'tamiz.
    });
  }, [unreadCount, enabled]);
}
