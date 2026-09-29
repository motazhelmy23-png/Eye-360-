import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats, Html5QrcodeCameraScanConfig } from 'html5-qrcode';
import { AlertCircle, RefreshCw, Camera, SwitchCamera, Tag, Play } from 'lucide-react';

interface BarcodeScannerProps {
  onScanSuccess: (decodedText: string) => void;
  onScanError?: (errorMessage: string) => void;
}

export function BarcodeScanner({ onScanSuccess, onScanError }: BarcodeScannerProps) {
  const [loading, setLoading] = useState(false);
  const [started, setStarted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cameras, setCameras] = useState<Array<{ id: string; label: string }>>([]);
  const [activeCameraIndex, setActiveCameraIndex] = useState(0);

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const isScanningRef = useRef(false);
  const successLockedRef = useRef(false);
  const divId = useRef(`html5-qrcode-${Math.random().toString(36).substring(2, 9)}`).current;

  const stopScanner = useCallback(async () => {
    if (scannerRef.current) {
      try {
        if (scannerRef.current.isScanning) {
          await scannerRef.current.stop();
        }
        await scannerRef.current.clear();
      } catch (err) {
        console.warn('Error stopping scanner:', err);
      }
      scannerRef.current = null;
    }
    isScanningRef.current = false;
  }, []);

  const startScanning = useCallback(async (cameraIdOrConfig: string | { facingMode: string }) => {
    successLockedRef.current = false;
    setLoading(true);
    setError(null);
    setStarted(true);

    // 1. Secure context check
    const isSecure = window.isSecureContext || location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    if (!isSecure) {
      setError("تشغيل الكاميرا يحتاج اتصال HTTPS آمن.");
      setLoading(false);
      return;
    }

    // 2. MediaDevices check
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setError("المتصفح لا يدعم الوصول إلى الكاميرا.");
      setLoading(false);
      return;
    }

    try {
      await stopScanner();

      const html5QrCode = new Html5Qrcode(divId, {
        formatsToSupport: [
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.CODE_93,
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.EAN_8,
          Html5QrcodeSupportedFormats.UPC_A,
          Html5QrcodeSupportedFormats.UPC_E,
          Html5QrcodeSupportedFormats.ITF,
          Html5QrcodeSupportedFormats.CODABAR,
          Html5QrcodeSupportedFormats.QR_CODE,
        ],
        verbose: false,
      });

      scannerRef.current = html5QrCode;

      const qrboxFunction = (viewfinderWidth: number, viewfinderHeight: number) => {
        const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
        const width = Math.floor(minEdge * 0.85);
        const height = Math.min(140, Math.floor(minEdge * 0.4));
        return { width, height };
      };

      const config: Html5QrcodeCameraScanConfig = {
        fps: 10,
        qrbox: qrboxFunction,
        aspectRatio: 1.777778,
      };

      const qrCodeSuccessCallback = (decodedText: string) => {
        if (successLockedRef.current) return;
        const scanned = decodedText ? String(decodedText).trim() : '';
        if (!scanned) return;

        successLockedRef.current = true;
        navigator.vibrate?.(80);

        stopScanner().then(() => {
          onScanSuccess(scanned);
        });
      };

      const qrCodeErrorCallback = (errorMessage: string) => {
        if (onScanError && errorMessage && !errorMessage.includes('NotFound') && !errorMessage.includes('No MultiFormat')) {
          onScanError(errorMessage);
        }
      };

      // Start camera
      if (typeof cameraIdOrConfig === 'string') {
        await html5QrCode.start(cameraIdOrConfig, config, qrCodeSuccessCallback, qrCodeErrorCallback);
      } else {
        try {
          await html5QrCode.start({ facingMode: cameraIdOrConfig.facingMode }, config, qrCodeSuccessCallback, qrCodeErrorCallback);
        } catch (envErr) {
          const devices = await Html5Qrcode.getCameras();
          if (devices && devices.length > 0) {
            setCameras(devices);
            const bestCamera = devices.find(d => {
              const lbl = d.label.toLowerCase();
              return lbl.includes('back') || lbl.includes('rear') || lbl.includes('environment');
            }) || devices[0];
            await html5QrCode.start(bestCamera.id, config, qrCodeSuccessCallback, qrCodeErrorCallback);
          } else {
            throw envErr;
          }
        }
      }

      isScanningRef.current = true;
      setLoading(false);

      try {
        const devs = await Html5Qrcode.getCameras();
        if (devs && devs.length > 0) {
          setCameras(devs);
        }
      } catch {
        // ignore enumeration errors
      }

    } catch (err: any) {
      console.error('Camera start error:', err);
      setLoading(false);
      isScanningRef.current = false;

      const errStr = String(err?.name || '') + ' ' + String(err?.message || '') + ' ' + String(err || '');
      const lower = errStr.toLowerCase();

      if (lower.includes('notallowed') || lower.includes('permission') || lower.includes('denied')) {
        setError("تم رفض إذن الكاميرا أو أن إطار المعاونة يمنع الوصول. اسمح بالوصول إلى الكاميرا من إعدادات المتصفح أو استخدم الباركود التجريبي أدناه.");
      } else if (lower.includes('notfound') || lower.includes('devicesnotfound')) {
        setError("لم يتم العثور على كاميرا على هذا الجهاز.");
      } else if (lower.includes('notreadable') || lower.includes('trackstart')) {
        setError("تعذر تشغيل الكاميرا. قد تكون مستخدمة بواسطة تطبيق آخر.");
      } else if (lower.includes('overconstrained')) {
        try {
          const devices = await Html5Qrcode.getCameras();
          if (devices && devices.length > 0) {
            await startScanning(devices[0].id);
            return;
          }
        } catch {
          // ignore
        }
        setError("تعذر تشغيل الكاميرا بالمواصفات المطلوبة.");
      } else {
        setError("تم رفض إذن الكاميرا أو تعذر تشغيل الماسح. يمكنك السماح بالصلاحية أو استخدام الباركود الفوري أدناه.");
      }
    }
  }, [divId, onScanSuccess, onScanError, stopScanner]);

  useEffect(() => {
    return () => {
      stopScanner();
    };
  }, [stopScanner]);

  const handleSwitchCamera = () => {
    if (cameras.length <= 1) return;
    const nextIndex = (activeCameraIndex + 1) % cameras.length;
    setActiveCameraIndex(nextIndex);
    startScanning(cameras[nextIndex].id);
  };

  return (
    <div className="w-full relative rounded-xl overflow-hidden bg-black border border-emerald-500/30 flex flex-col items-center justify-center min-h-[300px]">
      {!started && !error && (
        <div className="absolute inset-0 z-20 bg-[#0B1017] flex flex-col items-center justify-center p-6 space-y-4 text-center">
          <Camera className="w-12 h-12 text-emerald-400 animate-pulse" />
          <div className="space-y-1">
            <h4 className="text-white text-sm font-semibold">تشغيل ماسح الباركود بالكاميرا</h4>
            <p className="text-slate-400 text-xs max-w-xs leading-relaxed">انقر على الزر أدناه لبدء تشغيل الكاميرا ومنح إذن الوصول للمتصفح:</p>
          </div>
          <button
            type="button"
            onClick={() => startScanning({ facingMode: 'environment' })}
            className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold flex items-center gap-2 cursor-pointer shadow-lg shadow-emerald-600/30 transition-all"
          >
            <Play className="w-4 h-4 fill-current" />
            بدء تشغيل الكاميرا الآن
          </button>
        </div>
      )}

      {loading && (
        <div className="absolute inset-0 z-20 bg-black/85 flex flex-col items-center justify-center p-4 space-y-3">
          <RefreshCw className="w-8 h-8 text-emerald-400 animate-spin" />
          <p className="text-sm text-slate-200 font-medium">جاري تشغيل الكاميرا وطلب الإذن...</p>
        </div>
      )}

      {error ? (
        <div className="p-5 text-center space-y-3 bg-[#0B1017] w-full min-h-[300px] flex flex-col items-center justify-center z-20">
          <AlertCircle className="w-9 h-9 text-amber-400 mx-auto" />
          <p className="text-xs text-amber-200 max-w-xs leading-relaxed">{error}</p>
          <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
            <button
              type="button"
              onClick={() => startScanning({ facingMode: 'environment' })}
              className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors shadow-lg shadow-emerald-600/20"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              إعادة المحاولة
            </button>
          </div>
          <div className="pt-2 border-t border-white/10 w-full max-w-xs space-y-1.5">
            <span className="text-[10px] text-slate-400 block font-medium">أو تجربة باركود فوري للفحص:</span>
            <div className="flex flex-wrap gap-1.5 justify-center">
              {['7394586123476', '11752', '6221144223311'].map(b => (
                <button
                  key={b}
                  type="button"
                  onClick={() => {
                    stopScanner();
                    onScanSuccess(b);
                  }}
                  className="px-2.5 py-1 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded text-[11px] font-mono cursor-pointer transition-colors flex items-center gap-1"
                >
                  <Tag className="w-3 h-3" />
                  {b}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      <div id={divId} className="w-full min-h-[300px] max-h-[400px] bg-black overflow-hidden relative" />

      {started && !loading && !error && (
        <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-between p-4 z-10">
          <div className="bg-black/60 backdrop-blur-sm px-3 py-1.5 rounded-lg border border-white/10 text-center">
            <p className="text-[11px] text-emerald-300 font-medium">وجّه الكاميرا نحو الباركود وضعه بالكامل داخل الإطار</p>
          </div>

          <div className="w-3/4 max-w-[280px] h-[130px] border-2 border-dashed border-emerald-400/70 rounded-xl relative flex items-center justify-center bg-transparent shadow-[0_0_15px_rgba(47,129,247,0.15)]">
            <div className="absolute top-0 left-0 w-4 h-4 border-t-2 border-l-2 border-[#2F81F7] rounded-tl"></div>
            <div className="absolute top-0 right-0 w-4 h-4 border-t-2 border-r-2 border-[#2F81F7] rounded-tr"></div>
            <div className="absolute bottom-0 left-0 w-4 h-4 border-b-2 border-l-2 border-[#2F81F7] rounded-bl"></div>
            <div className="absolute bottom-0 right-0 w-4 h-4 border-b-2 border-r-2 border-[#2F81F7] rounded-br"></div>
            <div className="w-full h-0.5 bg-emerald-500/50 absolute animate-pulse"></div>
          </div>

          <div className="flex items-center gap-3">
            {cameras.length > 1 && (
              <button
                type="button"
                onClick={handleSwitchCamera}
                className="pointer-events-auto px-3 py-1.5 bg-black/70 hover:bg-black/90 backdrop-blur-md text-slate-200 border border-white/20 rounded-lg text-xs flex items-center gap-1.5 cursor-pointer shadow-lg transition-all"
              >
                <SwitchCamera className="w-3.5 h-3.5 text-emerald-400" />
                تبديل الكاميرا
              </button>
            )}
            <div className="bg-black/60 backdrop-blur-sm px-2.5 py-1 rounded-md text-[10px] text-slate-400 flex items-center gap-1">
              <Camera className="w-3 h-3 text-emerald-400" />
              <span>ماسح الباركود النشط</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
