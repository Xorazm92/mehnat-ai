"use client";

/**
 * STATUS CELL — matritsaning bitta katagi va uning amal menyusi.
 *
 * 212×46 = ~9 700 katak. Shuning uchun u `React.memo` va QO'LDA yozilgan
 * taqqoslash bilan himoyalangan: bitta katak o'zgarganda butun matritsa qayta
 * chizilmasin. Menyu `document.body` ga portal qilinadi — jadval
 * `overflow: auto` ichida va aks holda popover kesilib qolardi.
 */
import React, { useState, useMemo, useEffect } from "react";
import { createPortal } from "react-dom";
import { canApproveCell, isReviewerOwnedValue } from "@/lib/reportPermissions";
import { classifyCell } from "@/lib/reportStatus";
import type { CompanyRelation } from "@/lib/platform/access";
import { Button } from "@/components/ui/Button";
import { getStatusStyle, statusesForRole } from "./matrixVisuals";




export interface StatusCellProps {
  value: string;
  onUpdate: (newValue: string) => void;
  readOnly?: boolean;
  userRole: string;
  /** Foydalanuvchining AYNAN SHU firmadagi mas'uliyatlari. */
  relations: CompanyRelation[];
  proofStatus?: string; // 'pending' | 'approved' | 'rejected'
  /** Kutilayotgan dalilni AYNAN shu foydalanuvchi topshirganmi. */
  proofMine?: boolean;
  onRequestSubmit?: () => void;
  onViewProof?: () => void;
}

const PROOF_DOT: Record<string, string> = {
  pending: 'var(--info)',
  approved: 'var(--success)',
  rejected: 'var(--danger)',
};

export const StatusCell = React.memo<StatusCellProps>(({ value, onUpdate, readOnly, userRole, relations, proofStatus, proofMine, onRequestSubmit, onViewProof }) => {
  const style = getStatusStyle(value);
  // "isAccountant" = tasdiqlash huquqi YO'Q degani (server bilan bir xil qoida).
  // Nazoratchi o'zi buxgalteri bo'lgan firmada ham shu tarmoqqa tushadi.
  const isAccountant = !canApproveCell(userRole, relations);
  const menuStatuses = useMemo(
    () => statusesForRole(userRole, relations, proofStatus === 'pending'),
    [userRole, relations, proofStatus]
  );
  /**
   * Tasdiqlangan yoki tekshiruvda turgan katak buxgalter uchun QULFLANGAN —
   * server ham shuni rad etadi (lib/reportPermissions.checkCellWrite).
   *
   * ISTISNO: nazoratchi HALI KO'RMAGAN (`pending`) va topshirgan odam O'ZI
   * bo'lsa — katak ochiq qoladi. Busiz noto'g'ri ustunga yuborilgan
   * skrinshotni buxgalter tuzata olmasdi: menyu umuman ochilmasdi.
   */
  const canWithdrawOwn = proofStatus === 'pending' && proofMine === true;
  const lockedForAccountant = isAccountant && isReviewerOwnedValue(value) && !canWithdrawOwn;
  const effectiveReadOnly = readOnly || lockedForAccountant;
  const [isOpen, setIsOpen] = useState(false);
  // Izohni ko'rsatish oynasi — matn katakka sig'maydi, shuning uchun alohida.
  const [noteOpen, setNoteOpen] = useState(false);
  const [showInput, setShowInput] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [coords, setCoords] = useState({ top: 0, left: 0, width: 0 });
  const buttonRef = React.useRef<HTMLButtonElement>(null);
  const popoverRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Izoh oynasi ham shu koordinatalarga tayanadi, shuning uchun ikkalasidan
    // biri ochilsa hisoblanadi. Aks holda izoh (0,0) da — ekran burchagida —
    // paydo bo'lardi.
    if (!isOpen && !noteOpen) return;

    const updateCoords = () => {
      if (buttonRef.current) {
        const rect = buttonRef.current.getBoundingClientRect();
        setCoords({
          top: rect.bottom + window.scrollY,
          left: rect.left + window.scrollX + rect.width / 2,
          width: rect.width
        });
      }
    };

    updateCoords();
    window.addEventListener('scroll', updateCoords, true);
    window.addEventListener('resize', updateCoords);

    const handleClickOutside = (event: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node) &&
        buttonRef.current && !buttonRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setShowInput(false);
      }
    };

    // M9: katak ochilmasi faqat sichqoncha bilan yopilardi. Klaviatura bilan
    // ishlaydigan buxgalter uni yopa olmasdi — Escape hech qanday ta'sir
    // qilmasdi (ustunlar paneli esa `useDismissable` orqali yopilardi).
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      setShowInput(false);
      setIsOpen(false);
      setNoteOpen(false);
      buttonRef.current?.focus();
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape, true);
    return () => {
      window.removeEventListener('scroll', updateCoords, true);
      window.removeEventListener('resize', updateCoords);
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape, true);
    };
  }, [isOpen, noteOpen]);

  const handleSelect = (statusValue: string) => {
    if (statusValue === 'izoh') {
      /**
       * FAQAT haqiqiy izoh oldindan to'ldiriladi — tasniflagich hal qiladi.
       *
       * Ilgari bu yerda uchta qiymat qo'lda sanab o'tilgan edi ('0', '+', '-'),
       * ya'ni "nol"/"kartoteka"/"topshirildi" katagida "Matn yozish" bosilsa,
       * maydonga o'sha KOD SO'ZI tushardi. Foydalanuvchi uni saqlab qo'ysa
       * katak holatdan erkin matnga aylanib, hisobdan tushib qolardi.
       */
      setInputValue(classifyCell(value) === 'note' ? value : '');
      setShowInput(true);
      return;
    }

    // Buxgalter "Tasdiqlash"/"Topshirildi" ni tanlasa — to'g'ridan-to'g'ri
    // o'zgartirmaydi, avval skrinshot yuklash oynasini ochamiz. Faqat skrinshot
    // yuklangandan keyin katak "topshirildi" bo'ladi va nazoratchiga xabar boradi.
    if (isAccountant && (statusValue === '+' || statusValue === 'topshirildi')) {
      setIsOpen(false);
      onRequestSubmit?.();
      return;
    }

    // Nazoratchi kutilayotgan dalilli katakni "+" yoki "-" qilsa — bevosita
    // o'zgartirmasdan, tekshirish oynasini ochamiz. Shunda qaror reviewReportProof
    // orqali o'tadi: dalil holati yangilanadi va buxgalterga xabar boradi.
    if (!isAccountant && proofStatus === 'pending' && onViewProof && (statusValue === '+' || statusValue === '-')) {
      setIsOpen(false);
      onViewProof();
      return;
    }

    onUpdate(statusValue);
    setIsOpen(false);
  };

  const handleViewProof = () => {
    setIsOpen(false);
    onViewProof?.();
  };

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputValue.trim()) {
      onUpdate(inputValue.trim());
    }
    setIsOpen(false);
    setShowInput(false);
  };

  return (
    <div className="relative flex items-center justify-center w-full h-full p-0.5">
      <button
        ref={buttonRef}
        onClick={() => {
          if (!effectiveReadOnly) setIsOpen(!isOpen);
          else if (proofStatus) handleViewProof();
          // Faqat o'qiy oladigan foydalanuvchi ham izohni ko'ra olishi kerak:
          // matn endi katakka chizilmaydi, shuning uchun yagona yo'l — ochish.
          else if (style.isNote) setNoteOpen(true);
        }}
        disabled={effectiveReadOnly && !proofStatus && !style.isNote}
        className={`w-full h-6 min-w-[24px] max-w-[52px] mx-auto px-1 rounded-lg flex items-center justify-center text-micro font-bold transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed ${
          style.bg === 'transparent'
            ? 'border border-transparent hover:bg-[var(--bg-hover)] hover:border-[var(--rule)]'
            : 'border border-black/5 dark:border-white/5 hover:opacity-80'
        }`}
        style={{ background: style.bg, color: style.text }}
        title={
          lockedForAccountant
            ? `${style.tooltip} · Nazoratchi qaroridagi katak — o'zgartirib bo'lmaydi`
            : proofStatus ? `${style.tooltip} · Skrinshot biriktirilgan` : style.tooltip
        }
      >
        {/* Izohda MATN ko'rinadi (qisqartirilgan), boshqa holatlarda belgi.
            `truncate` overflow'ni yopgani uchun flex bolasi 0 gacha siqiladi
            va `max-w-[52px]` ustunni cho'zilishdan saqlaydi. */}
        <span
          className={`truncate w-full block ${style.isNote ? 'text-left normal-case font-semibold' : 'text-center uppercase'}`}
        >
          {style.isNote ? value : style.icon}
        </span>
      </button>
      {proofStatus && (
        <span
          className="absolute top-0 right-0 w-2 h-2 rounded-full ring-1 ring-white dark:ring-[var(--surface)] pointer-events-none"
          style={{ background: PROOF_DOT[proofStatus] || 'var(--info)' }}
          title="Skrinshot biriktirilgan"
        />
      )}

      {/* IZOH OYNASI — matn katakka chizilmaydi, shuning uchun bosilganda
          shu yerda to'liq ko'rinadi. Qator balandligi o'zgarmaydi. */}
      {noteOpen && createPortal(
        // Dialog EMAS: izoh popover'i. Escape, tashqi bosish va fokusni
        // qaytarish yuqoridagi `useEffect` da allaqachon bor ("M9" izohi).
        // `z-[120]` QO'LDA terilgan edi — shkalada bunday pog'ona yo'q.
        // Bu popover, ya'ni `--z-popover` qavati.
        // eslint-disable-next-line no-restricted-syntax
        <div className="fixed inset-0" style={{ zIndex: "var(--z-popover, 200)" }} onClick={() => setNoteOpen(false)}>
          <div className="absolute inset-0" style={{ background: 'color-mix(in srgb, var(--surface-2) 45%, transparent)' }} />
          <div
            className="absolute p-4 rounded-xl shadow-2xl max-w-[420px]"
            style={{
              top: Math.min(coords.top + 4, window.innerHeight - 200),
              left: Math.max(10, Math.min(coords.left, window.innerWidth - 430)),
              background: 'var(--card-bg)',
              border: '1px solid var(--rule)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-micro font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--text-muted)' }}>
              Izoh
            </div>
            <p className="text-body whitespace-pre-wrap break-words" style={{ color: 'var(--text)' }}>
              {value}
            </p>
          </div>
        </div>,
        document.body
      )}

      {isOpen && createPortal(
        <div
          ref={popoverRef}
          /**
           * `role="dialog"` ATAYLAB: `useAutoRefresh` ochiq dialog ustida
           * `router.refresh()` ni to'xtatadi. Busiz katak menyusi ochiq
           * turganda — ya'ni aynan izoh yozilayotgan paytda — har 15 soniyada
           * sahifa server ma'lumoti bilan qayta to'ldirilardi.
           */
          role="dialog"
          aria-label="Katak amallari"
          style={{
            position: 'absolute',
            top: coords.top + 2,
            left: coords.left,
            transform: 'translateX(-50%)'
          }}
          className="z-[110] min-w-[180px] max-w-[280px] bg-[var(--card-bg)] dark:bg-[var(--surface-2)] p-1 shadow-md border border-[var(--rule)] dark:border-[var(--rule-strong)] rounded-lg"
        >
          {!showInput ? (
            <div className="grid grid-cols-1">
              {/* YOZILGAN IZOH — menyuning eng tepasida.
                  Tahrirlash huquqi bor odam katakni bosganda menyu ochiladi,
                  ya'ni `noteOpen` oynasiga hech qachon yetib bormaydi. Matn
                  shu sabab aynan SHU YERDA turishi shart: busiz izoh
                  yozilgandan keyin uni qayta o'qishning yo'li qolmaydi. */}
              {style.isNote && (
                <>
                  <div className="px-3 pt-2 pb-1.5">
                    <div className="text-2xs font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--text-3)' }}>
                      Yozilgan izoh
                    </div>
                    <p className="text-meta whitespace-pre-wrap break-words" style={{ color: 'var(--text)' }}>
                      {value}
                    </p>
                  </div>
                  <div className="h-px my-1" style={{ background: 'var(--border)' }} />
                </>
              )}
              {proofStatus && onViewProof && (
                <>
                  <button
                    onClick={handleViewProof}
                    className="flex items-center gap-3 px-3 py-2 hover:bg-[var(--bg-sunken)] dark:hover:bg-[var(--surface-2)] transition-colors w-full text-left group"
                  >
                    <span className="w-5 h-5 flex items-center justify-center rounded-lg" style={{ background: 'var(--primary-ghost)' }}>
                      <span className="w-2 h-2 rounded-full" style={{ background: PROOF_DOT[proofStatus] || 'var(--info)' }} />
                    </span>
                    <span className="text-meta font-bold text-[var(--text-secondary)] group-hover:text-[var(--brand)]">Skrinshotni ko&apos;rish</span>
                  </button>
                  <div className="h-px my-1" style={{ background: 'var(--border)' }} />
                </>
              )}
              {menuStatuses.map((status) => (
                <button
                  key={status.value}
                  onClick={() => handleSelect(status.value)}
                  className="flex items-center gap-3 px-3 py-2 hover:bg-[var(--bg-sunken)] dark:hover:bg-[var(--surface-2)] transition-colors w-full text-left group"
                >
                  <span className={`font-bold text-xs w-5 h-5 flex items-center justify-center rounded-lg bg-[var(--bg-sunken)] dark:bg-white/5 border border-[var(--rule)] dark:border-white/10 ${status.color}`}>{status.icon}</span>
                  <span className="text-meta font-bold text-[var(--text-secondary)] group-hover:text-[var(--brand)]">
                    {status.value === 'izoh' && style.isNote ? 'Izohni tahrirlash' : status.label}
                  </span>
                  {value === status.value && <div className="ml-auto w-1 h-1 rounded-full bg-[var(--brand)]"></div>}
                </button>
              ))}
              {isAccountant && (
                <>
                  <div className="h-px my-1" style={{ background: 'var(--border)' }} />
                  <p className="px-3 py-1.5 text-2xs leading-snug" style={{ color: 'var(--text-3)' }}>
                    Tasdiqlashni nazoratchi bajaradi.
                  </p>
                </>
              )}
            </div>
          ) : (
            <form onSubmit={handleCustomSubmit} className="p-2">
              <input
                autoFocus
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder="Matn kiriting..."
                className="c1-input w-full text-xs font-bold mb-2"
              />
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" type="button" onClick={() => setShowInput(false)} className="flex-1">Bekor</Button>
                <Button variant="primary" size="sm" type="submit" className="flex-1">Saqlash</Button>
              </div>
            </form>
          )}

        </div>,
        document.body
      )}
    </div>
  );
}, (prev, next) => prev.value === next.value && prev.readOnly === next.readOnly && prev.proofStatus === next.proofStatus && prev.proofMine === next.proofMine && prev.relations === next.relations);
StatusCell.displayName = "StatusCell";

export default StatusCell;
