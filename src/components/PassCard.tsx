import React, { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { toPng } from 'html-to-image';
import { Download, ShieldCheck, Share2, Copy, Check, Calendar, MapPin, Users, Home, Sparkles, UtensilsCrossed, Leaf } from 'lucide-react';
import { PassRecord, SocietyEvent } from '../types';

interface PassCardProps {
  pass: PassRecord;
  event: SocietyEvent;
  onClose?: () => void;
}

export const PassCard: React.FC<PassCardProps> = ({ pass, event, onClose }) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [isDownloading, setIsDownloading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [shareSupported, setShareSupported] = useState(false);

  useEffect(() => {
    setShareSupported(typeof navigator !== 'undefined' && !!navigator.share);

    // Generate high-resolution QR code offline
    QRCode.toDataURL(pass.qrPayload, {
      width: 480,
      margin: 1,
      color: {
        dark: '#1c1917', // stone-900
        light: '#ffffff',
      },
      errorCorrectionLevel: 'M',
    })
      .then((url) => setQrDataUrl(url))
      .catch((err) => console.error('Failed to generate QR code', err));
  }, [pass.qrPayload]);

  /**
   * High-resolution PNG download supporting modern Tailwind CSS colors
   * Uses native SVG ForeignObject via html-to-image, with high-DPI canvas fallback
   */
  const handleDownload = async () => {
    if (!cardRef.current) return;
    setIsDownloading(true);

    const filename = `Pass_${pass.houseNo.replace(/[^a-zA-Z0-9]/g, '_')}_${pass.eventCode}.png`;

    try {
      let dataUrl: string | null = null;
      try {
        dataUrl = await toPng(cardRef.current, {
          pixelRatio: 2.5,
          backgroundColor: '#fffbeb',
          cacheBust: true,
        });
      } catch {
        dataUrl = null;
      }

      if (dataUrl) {
        const link = document.createElement('a');
        link.download = filename;
        link.href = dataUrl;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } else {
        await drawNativeCanvasDownload(filename);
      }
    } catch {
      await drawNativeCanvasDownload(filename);
    } finally {
      setIsDownloading(false);
    }
  };

  const drawNativeCanvasDownload = async (targetFilename?: string): Promise<void> => {
    const filename = targetFilename || `Pass_${pass.houseNo.replace(/[^a-zA-Z0-9]/g, '_')}_${pass.eventCode}.png`;
    return new Promise((resolve) => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 900;
        canvas.height = 1400;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve();
          return;
        }

        // Background gradient
        const grad = ctx.createLinearGradient(0, 0, 0, 1400);
        grad.addColorStop(0, '#fffbeb');
        grad.addColorStop(1, '#fef3c7');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 900, 1400);

        // Header banner
        ctx.fillStyle = '#ea580c';
        ctx.fillRect(0, 0, 900, 240);

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 36px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(pass.societyName.toUpperCase(), 450, 80);

        ctx.fillStyle = '#fde047';
        ctx.font = 'bold 44px sans-serif';
        ctx.fillText(pass.eventName, 450, 150);

        ctx.fillStyle = '#ffffff';
        ctx.font = '26px sans-serif';
        ctx.fillText(`★ OFFICIAL DIGITAL EVENT & DINNER PASS ★`, 450, 205);

        // Verified badge
        ctx.fillStyle = '#059669';
        ctx.beginPath();
        ctx.roundRect(250, 280, 400, 70, 35);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 30px sans-serif';
        ctx.fillText('✔ PAID & VERIFIED', 450, 327);

        // Details box
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.roundRect(80, 380, 740, 360, 24);
        ctx.fill();
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 4;
        ctx.stroke();

        ctx.textAlign = 'left';
        ctx.fillStyle = '#78716c';
        ctx.font = '24px sans-serif';
        ctx.fillText('HOUSE NUMBER', 120, 440);
        ctx.fillStyle = '#ea580c';
        ctx.font = 'bold 52px sans-serif';
        ctx.fillText(pass.houseNo, 120, 500);

        ctx.fillStyle = '#78716c';
        ctx.font = '24px sans-serif';
        ctx.fillText('PRIMARY RESIDENT', 120, 570);
        ctx.fillStyle = '#1c1917';
        ctx.font = 'bold 36px sans-serif';
        ctx.fillText(pass.residentName, 120, 620);

        ctx.fillStyle = '#78716c';
        ctx.font = '24px sans-serif';
        ctx.fillText('ATTENDEE / DINNER PASSES', 120, 680);
        ctx.fillStyle = '#059669';
        ctx.font = 'bold 36px sans-serif';
        const foodDietLabel = pass.swaminarayanCount && pass.swaminarayanCount > 0
          ? ` (${pass.swaminarayanCount} Swami/Jain, ${pass.memberCount - pass.swaminarayanCount} Reg)`
          : pass.foodPreference === 'swaminarayan_jain'
          ? ' (Swami/Jain No Onion-Garlic)'
          : ' (Regular Pure Veg)';
        ctx.fillText(`${pass.memberCount} Members Attending${foodDietLabel}`, 120, 725);

        const completeDownload = () => {
          ctx.textAlign = 'center';
          ctx.fillStyle = '#44403c';
          ctx.font = 'bold 24px monospace';
          ctx.fillText(pass.qrPayload, 450, 1220);

          ctx.fillStyle = '#78716c';
          ctx.font = '22px sans-serif';
          ctx.fillText(`Pass ID: ${pass.id} • Contribution: ₹${pass.amountPaid} Paid`, 450, 1280);
          ctx.fillText(`Scan at Gate for Fast Track Verification`, 450, 1320);

          const dataUrl = canvas.toDataURL('image/png');
          const link = document.createElement('a');
          link.download = filename;
          link.href = dataUrl;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          resolve();
        };

        // QR Image
        if (qrDataUrl) {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.onload = () => {
            ctx.drawImage(img, 250, 780, 400, 400);
            completeDownload();
          };
          img.onerror = () => {
            completeDownload();
          };
          img.src = qrDataUrl;
        } else {
          completeDownload();
        }
      } catch (e) {
        console.error('Native canvas draw failed', e);
        resolve();
      }
    });
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `${event.name} Digital Pass - House ${pass.houseNo}`,
          text: `Digital Event Pass for ${pass.societyName} - ${event.name}.\nHouse: ${pass.houseNo}\nPrimary: ${pass.residentName}\nMembers: ${pass.memberCount}\nPass ID: ${pass.id}`,
        });
      } catch (err) {
        console.error('Share dismissed or failed', err);
      }
    }
  };

  const copyPayload = () => {
    navigator.clipboard.writeText(pass.qrPayload);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col items-center w-full max-w-md mx-auto">
      {/* Visual Digital Event Pass Card */}
      <div
        ref={cardRef}
        id={`pass-card-${pass.id}`}
        className="w-full relative bg-amber-50 rounded-3xl shadow-2xl border-2 border-amber-300 overflow-hidden text-stone-900 transition-all"
        style={{
          boxShadow: '0 20px 35px -10px rgba(234, 88, 12, 0.2), 0 10px 15px -5px rgba(0, 0, 0, 0.06)',
        }}
      >
        {/* Festive Golden Top Accent */}
        <div className="h-2 bg-gradient-to-r from-amber-400 via-orange-500 to-amber-400" />

        {/* Card Header */}
        <div className="p-5 bg-gradient-to-b from-orange-600 via-orange-600 to-amber-700 text-white relative overflow-hidden">
          {/* Subtle geometric mandala watermark */}
          <div className="absolute -right-8 -bottom-8 w-36 h-36 rounded-full border-8 border-white/10 pointer-events-none" />
          <div className="absolute right-4 -top-6 w-24 h-24 rounded-full border-4 border-amber-300/20 pointer-events-none" />

          <div className="flex items-center justify-between gap-2 mb-2 relative z-10">
            <span className="text-xs font-semibold uppercase tracking-widest text-amber-200">
              {pass.societyName}
            </span>
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-400 text-orange-950 uppercase tracking-wider shadow-xs">
              <Sparkles className="w-3 h-3" />
              Official Pass
            </span>
          </div>

          <h2 className="text-2xl font-black tracking-tight text-white drop-shadow-xs relative z-10">
            {pass.eventName}
          </h2>

          <div className="mt-3 pt-3 border-t border-white/20 flex items-center justify-between text-xs text-orange-100 relative z-10">
            <div className="flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-amber-300" />
              <span>{event.date}</span>
            </div>
            <div className="flex items-center gap-1.5 truncate max-w-[170px]">
              <MapPin className="w-3.5 h-3.5 text-amber-300 shrink-0" />
              <span className="truncate">{event.venue}</span>
            </div>
          </div>
        </div>

        {/* Paid & Verified Holographic Badge Strip */}
        <div className="px-5 py-2.5 bg-emerald-700 text-white flex items-center justify-between shadow-inner">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-emerald-500 border border-emerald-300 flex items-center justify-center text-white">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <span className="text-xs font-extrabold tracking-wider uppercase text-emerald-100">
              PAID &amp; VERIFIED PASS
            </span>
          </div>
          <span className="text-xs font-bold text-amber-200 tracking-wide">
            ₹{pass.amountPaid.toLocaleString()} Contributed
          </span>
        </div>

        {/* Resident & Attendance Details */}
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3 bg-white/90 p-3.5 rounded-2xl border border-amber-200/80 shadow-xs">
            <div>
              <span className="text-[11px] uppercase tracking-wider text-stone-500 font-semibold flex items-center gap-1">
                <Home className="w-3.5 h-3.5 text-orange-600" />
                House Number
              </span>
              <p className="text-2xl font-black text-orange-600 tracking-tight mt-0.5">
                {pass.houseNo}
              </p>
            </div>
            <div>
              <span className="text-[11px] uppercase tracking-wider text-stone-500 font-semibold flex items-center gap-1">
                <Users className="w-3.5 h-3.5 text-emerald-600" />
                Dinner / Gate Pass
              </span>
              <p className="text-2xl font-black text-stone-800 tracking-tight mt-0.5">
                {pass.memberCount} <span className="text-sm font-medium text-stone-500">{pass.memberCount === 1 ? 'Person' : 'Members'}</span>
              </p>
            </div>
          </div>

          <div className="bg-white/90 px-4 py-3 rounded-2xl border border-amber-200/80 shadow-xs flex items-center justify-between">
            <div>
              <span className="text-[11px] uppercase tracking-wider text-stone-500 font-semibold">
                Primary Resident
              </span>
              <p className="text-base font-bold text-stone-900">
                {pass.residentName}
              </p>
            </div>
            <div className="text-right">
              <span className="text-[11px] uppercase tracking-wider text-stone-400 font-semibold">
                Pass Serial
              </span>
              <p className="text-xs font-mono font-bold text-stone-600">
                {pass.id}
              </p>
            </div>
          </div>

          {/* Food / Prasad Dietary Preference Badge */}
          <div className={`p-3 rounded-2xl border flex items-center justify-between text-xs ${
            pass.foodPreference === 'swaminarayan_jain' || (pass.swaminarayanCount && pass.swaminarayanCount > 0)
              ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
              : 'bg-white border-stone-200 text-stone-800'
          }`}>
            <div className="flex items-center gap-2">
              <span className={`p-1.5 rounded-lg ${
                pass.foodPreference === 'swaminarayan_jain' || (pass.swaminarayanCount && pass.swaminarayanCount > 0)
                  ? 'bg-emerald-100 text-emerald-800'
                  : 'bg-orange-100 text-orange-800'
              }`}>
                {pass.foodPreference === 'swaminarayan_jain' || (pass.swaminarayanCount && pass.swaminarayanCount > 0) ? (
                  <Leaf className="w-3.5 h-3.5" />
                ) : (
                  <UtensilsCrossed className="w-3.5 h-3.5" />
                )}
              </span>
              <div>
                <span className="text-[10px] uppercase font-bold text-stone-500 block">
                  Dinner / Prasad Dietary
                </span>
                <span className="font-bold text-xs">
                  {pass.swaminarayanCount && pass.swaminarayanCount > 0 ? (
                    pass.swaminarayanCount === pass.memberCount ? (
                      <span className="text-emerald-800">100% Swaminarayan / Jain (No Onion &amp; Garlic)</span>
                    ) : (
                      <span>
                        <strong className="text-emerald-800">{pass.swaminarayanCount} Swaminarayan/Jain</strong>
                        <span className="text-stone-500 font-normal"> + </span>
                        <strong className="text-orange-800">{pass.memberCount - pass.swaminarayanCount} Regular</strong>
                      </span>
                    )
                  ) : pass.foodPreference === 'swaminarayan_jain' ? (
                    <span className="text-emerald-800">Swaminarayan / Jain (No Onion &amp; Garlic)</span>
                  ) : (
                    <span className="text-stone-700">Regular Pure Veg</span>
                  )}
                </span>
              </div>
            </div>
            <span className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full ${
              pass.foodPreference === 'swaminarayan_jain' || (pass.swaminarayanCount && pass.swaminarayanCount > 0)
                ? 'bg-emerald-200/80 text-emerald-900'
                : 'bg-stone-100 text-stone-700'
            }`}>
              {pass.foodPreference === 'swaminarayan_jain' || (pass.swaminarayanCount && pass.swaminarayanCount > 0) ? 'Jain / Swami' : 'Regular Veg'}
            </span>
          </div>

          {/* Ticket Perforation / Divider with Cutout Notches */}
          <div className="relative py-2 flex items-center justify-center">
            {/* Left circular cutout */}
            <div className="absolute -left-9 w-7 h-7 rounded-full bg-amber-50/40 border-r-2 border-amber-300 shadow-inner" />
            {/* Dashed line */}
            <div className="w-full border-t-2 border-dashed border-amber-300/80" />
            {/* Right circular cutout */}
            <div className="absolute -right-9 w-7 h-7 rounded-full bg-amber-50/40 border-l-2 border-amber-300 shadow-inner" />
          </div>

          {/* QR Code Container */}
          <div className="flex flex-col items-center justify-center bg-white p-4 rounded-2xl border-2 border-amber-200 shadow-sm text-center">
            <div className="p-2 bg-white rounded-xl shadow-inner border border-stone-200">
              {qrDataUrl ? (
                <img
                  src={qrDataUrl}
                  alt={`QR code for ${pass.houseNo}`}
                  className="w-48 h-48 sm:w-56 sm:h-56 object-contain"
                />
              ) : (
                <div className="w-48 h-48 flex items-center justify-center text-stone-400 text-xs">
                  Generating QR...
                </div>
              )}
            </div>

            <div className="mt-2.5 w-full">
              <p className="text-[11px] font-mono text-stone-500 truncate px-2">
                {pass.qrPayload}
              </p>
              <p className="text-xs font-semibold text-orange-800 mt-1 flex items-center justify-center gap-1">
                <span>Scan at gate for instant approved entry</span>
              </p>
            </div>
          </div>

          <div className="text-center text-[11px] text-stone-400 pb-1">
            Issued {new Date(pass.issuedAt).toLocaleDateString()} • Keep this pass saved in phone gallery
          </div>
        </div>
      </div>

      {/* Action Buttons for Resident */}
      <div className="w-full mt-4 flex flex-col sm:flex-row items-center gap-2.5">
        <button
          id="btn-download-pass"
          onClick={handleDownload}
          disabled={isDownloading}
          className="w-full flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-700 hover:to-amber-700 active:scale-[0.98] text-white font-bold text-sm shadow-md flex items-center justify-center gap-2 transition disabled:opacity-50"
        >
          <Download className="w-4 h-4" />
          <span>{isDownloading ? 'Generating PNG...' : 'Download Pass Image'}</span>
        </button>

        {shareSupported && (
          <button
            id="btn-share-pass"
            onClick={handleShare}
            className="w-full sm:w-auto py-3 px-4 rounded-xl bg-white hover:bg-stone-50 border border-stone-300 text-stone-700 font-semibold text-sm shadow-xs flex items-center justify-center gap-1.5 transition active:scale-95"
          >
            <Share2 className="w-4 h-4 text-orange-600" />
            <span>Share</span>
          </button>
        )}

        <button
          id="btn-copy-payload"
          onClick={copyPayload}
          title="Copy QR Payload"
          className="w-full sm:w-auto py-3 px-4 rounded-xl bg-white hover:bg-stone-50 border border-stone-300 text-stone-700 font-semibold text-sm shadow-xs flex items-center justify-center gap-1.5 transition active:scale-95"
        >
          {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4 text-stone-500" />}
          <span>{copied ? 'Copied' : 'Copy Code'}</span>
        </button>
      </div>

      {onClose && (
        <button
          onClick={onClose}
          className="mt-3 text-xs text-stone-500 hover:text-stone-800 underline"
        >
          Generate Another Pass
        </button>
      )}
    </div>
  );
};
