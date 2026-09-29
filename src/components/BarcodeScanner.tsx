import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats, Html5QrcodeCameraScanConfig } from 'html5-qrcode';
import { AlertCircle, RefreshCw, Camera, SwitchCamera, Tag, Play, Info } from 'lucide-react';

interface BarcodeScannerProps {
  onScanSuccess: (decodedText: string) => void;
  onScanError?: (errorMessage: string) => void;
}

export function BarcodeScanner({ onScanSuccess, onScanError }: BarcodeScannerProps) {
  const [loading, setLoading] = useState(false);
  const [started, setStarted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cameras, setCameras] = useState<Array<{ id: string; label: string }>>([]);
  const [activeCameraId, setActiveCameraId] = useState<string | null>(null);
  const [diagnostics, setDiagnostics] = useState<Record<string, any>>({});
  const [showDiagnostics, setShowDiagnostics] = useState(false);

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const successLockedRef = useRef(false);
  const tempStreamRef = useRef<MediaStream | null>(null);
  const divId = useRef(`html5-qrcode-${Math.random().toString(36).substring(2, 9)}`).current;

  const fullCleanup = useCallback(async () => {
    if (tempStreamRef.current) {
      try {
        tempStreamRef.current.getTracks().forEach(t => t.stop());
      } catch (e) {
        console.warn('Error stopping temp stream:', e);
      }
      tempStreamRef.current = null;
    }

    if (scannerRef.current) {
      try {
        if (scannerRef.current.isScanning) {
          await scannerRef.current.stop();
        }
        await scannerRef.current.clear();
      } catch (err) {
        console.warn('Error cleaning up scanner instance:', err);
      }
      scannerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      fullCleanup();
    };
  }, [fullCleanup]);

  const runDiagnosticsData = async (errObj?: any) => {
    const isSecure = window.isSecureContext || location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    const isIframe = window.self !== window.top;
    let permState = 'unknown';
    try {
      if (navigator.permissions && navigator.permissions.query) {
        const status = await navigator.permissions.query({ name: 'camera' as PermissionName });
        permState = status.state;
      }
    } catch {
      // ignore
    }

    let videoInputsCount = 0;
    try {
      const devs = await navigator.mediaDevices?.enumerateDevices();
      videoInputsCount = devs?.filter(d => d.kind === 'videoinput').length || 0;
    } catch {
      // ignore
    }

    const videoEl = document.querySelector(`#${divId} video`) as HTMLVideoElement | null;

    setDiagnostics({
      secureContext: isSecure ? 'YES' : 'NO',
      protocol: location.protocol.replace(':', ''),
      mediaDevices: navigator.mediaDevices ? 'AVAILABLE' : 'MISSING',
      permissionState: permState,
      videoInputs: videoInputsCount,
      isEmbeddedIframe: isIframe ? 'YES' : 'NO',
      scannerState: scannerRef.current ? (scannerRef.current.isScanning ? 'SCANNING' : 'IDLE') : 'NULL',
      videoElementCreated: videoEl ? 'YES' : 'NO',
      videoWidth: videoEl ? videoEl.videoWidth : 0,
      videoHeight: videoEl ? videoEl.videoHeight : 0,
      lastError: errObj ? String(errObj?.message || errObj) : 'None',
    });
  };

  const startCameraProcess = useCallback(async (targetDeviceId?: string) => {
    successLockedRef.current = false;
    setLoading(true);
    setStarted(false);
    setError(null);

    const isSecure = window.isSecureContext || location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    const isIframe = window.self !== window.top;

    if (!isSecure) {
      setError("تشغيل الكاميرا يحتاج اتصال HTTPS آمن.");
      setLoading(false);
      await runDiagnosticsData("Insecure context");
      return;
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setError("المتصفح لا يدعم الوصول إلى الكاميرا.");
      setLoading(false);
      await runDiagnosticsData("MediaDevices missing");
      return;
    }

    try {
      await fullCleanup();

      // 1. Explicit permission probe via getUserMedia
      let stream: MediaStream | null = null;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
      } catch (envErr: any) {
        if (envErr?.name === 'OverconstrainedError') {
          stream = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: false,
          });
        } else {
          throw envErr;
        }
      }

      if (stream) {
        tempStreamRef.current = stream;
        stream.getTracks().forEach(t => t.stop());
        tempStreamRef.current = null;
      }

      // 2. Enumerate cameras after permission
      const rawDevices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = rawDevices.filter(d => d.kind === 'videoinput');
      setCameras(videoDevices.map(d => ({ id: d.deviceId, label: d.label || `Camera ${d.deviceId.substring(0, 5)}` })));

      let selectedDeviceId = targetDeviceId;
      if (!selectedDeviceId && videoDevices.length > 0) {
        const best = videoDevices.find(d => {
          const l = d.label.toLowerCase();
          return l.includes('back') || l.includes('rear') || l.includes('environment') || l.includes('world');
        }) || (videoDevices.length > 1 ? videoDevices[videoDevices.length - 1] : videoDevices[0]);
        selectedDeviceId = best.deviceId;
      }
      setActiveCameraId(selectedDeviceId || null);

      // 3. Create brand new Html5Qrcode instance
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
        const width = Math.floor(viewfinderWidth * 0.82);
        const height = Math.min(140, Math.max(100, Math.floor(viewfinderHeight * 0.30)));
        return { width, height };
      };

      const config: Html5QrcodeCameraScanConfig = {
        fps: 10,
        qrbox: qrboxFunction,
      };

      const qrCodeSuccessCallback = (decodedText: string) => {
        if (successLockedRef.current) return;
        const scanned = decodedText ? String(decodedText).trim() : '';
        if (!scanned) return;

        successLockedRef.current = true;
        navigator.vibrate?.(80);

        fullCleanup().then(() => {
          onScanSuccess(scanned);
        });
      };

      const qrCodeErrorCallback = (errorMessage: string) => {
        if (onScanError && errorMessage && !errorMessage.includes('NotFound') && !errorMessage.includes('No MultiFormat')) {
          onScanError(errorMessage);
        }
      };

      // Start timeout promise (9 seconds)
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('CAMERA_TIMEOUT')), 9000);
      });

      const startPromise = selectedDeviceId
        ? html5QrCode.start({ deviceId: { exact: selectedDeviceId } }, config, qrCodeSuccessCallback, qrCodeErrorCallback)
        : html5QrCode.start({ facingMode: "environment" }, config, qrCodeSuccessCallback, qrCodeErrorCallback);

      await Promise.race([startPromise, timeoutPromise]);

      // 4. Confirm video element actually started and has dimensions
      let videoReady = false;
      let checks = 0;
      while (!videoReady && checks < 30) {
        await new Promise(r => setTimeout(r, 150));
        const videoEl = document.querySelector(`#${divId} video`) as HTMLVideoElement | null;
        if (videoEl && videoEl.videoWidth > 0 && videoEl.videoHeight > 0) {
          videoReady = true;
        }
        checks++;
      }

      if (!videoReady) {
        throw new Error('VIDEO_DIMENSIONS_ZERO');
      }

      setLoading(false);
      setStarted(true);
      await runDiagnosticsData();

    } catch (err: any) {
      console.error('Real camera startup error:', err);
      await fullCleanup();
      setLoading(false);
      setStarted(false);

      const errName = String(err?.name || err?.message || err);
      const lower = errName.toLowerCase();

      if (isIframe && (lower.includes('notallowed') || lower.includes('permission') || lower.includes('denied') || lower.includes('security'))) {
        setError("قد تمنع بيئة المعاينة الوصول إلى الكاميرا. افتح رابط التطبيق المباشر في نافذة مستقلة (Vercel URL).");
      } else if (lower.includes('notallowed') || lower.includes('permission') || lower.includes('denied')) {
        setError("تم رفض إذن الكاميرا. اضغط على أيقونة إعدادات الموقع بجوار عنوان الصفحة واسمح باستخدام الكاميرا، ثم أعد المحاولة.");
      } else if (lower.includes('notfound') || lower.includes('devicesnotfound')) {
        setError("لم يتم العثور على كاميرا متاحة على هذا الجهاز.");
      } else if (lower.includes('notreadable') || lower.includes('trackstart')) {
        setError("الكاميرا موجودة ولكن تعذر تشغيلها. أغلق أي برنامج آخر يستخدم الكاميرا ثم حاول مرة أخرى.");
      } else if (lower.includes('securityerror')) {
        setError("المتصفح منع الوصول إلى الكاميرا لأسباب أمنية.");
      } else if (lower.includes('timeout') || lower.includes('dimensions_zero')) {
        setError("استغرق تشغيل الكاميرا وقتاً أطول من المتوقع. أعد المحاولة أو اختر كاميرا أخرى.");
      } else {
        setError("تعذر تشغيل ماسح الباركود. تأكد من صلاحيات الكاميرا وحاول مرة أخرى.");
      }

      await runDiagnosticsData(err);
    }
  }, [divId, onScanSuccess, onScanError, fullCleanup]);

  const handleSwitchCamera = () => {
    if (cameras.length <= 1) return;
    const currentIndex = cameras.findIndex(c => c.id === activeCameraId);
    const nextIndex = (currentIndex + 1) % cameras.length;
    startCameraProcess(cameras[nextIndex].id);
  };

  return (
    <div className="w-full relative rounded-xl overflow-hidden bg-black border border-emerald-500/30 flex flex-col items-center justify-center min-h-[300px]">
      {!started && !loading && !error && (
        <div className="absolute inset-0 z-20 bg-[#0B1017] flex flex-col items-center justify-center p-6 space-y-4 text-center">
          <Camera className="w-12 h-12 text-emerald-400 animate-pulse" />
          <div className="space-y-1">
            <h4 className="text-white text-sm font-semibold">تشغيل ماسح الباركود بالكاميرا الحية</h4>
            <p className="text-slate-400 text-xs max-w-xs leading-relaxed">انقر على الزر أدناه لمنح إذن الكاميرا وبدء الفحص المباشر:</p>
          </div>
          <button
            type="button"
            onClick={() => startCameraProcess()}
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
          <p className="text-sm text-slate-200 font-medium">جاري تشغيل الكاميرا...</p>
        </div>
      )}

      {error ? (
        <div className="p-5 text-center space-y-3 bg-[#0B1017] w-full min-h-[300px] flex flex-col items-center justify-center z-20">
          <AlertCircle className="w-9 h-9 text-amber-400 mx-auto" />
          <p className="text-xs text-amber-200 max-w-xs leading-relaxed">{error}</p>
          <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
            <button
              type="button"
              onClick={() => startCameraProcess()}
              className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors shadow-lg shadow-emerald-600/20"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              إعادة المحاولة
            </button>
            <button
              type="button"
              onClick={() => setShowDiagnostics(!showDiagnostics)}
              className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-slate-300 rounded-lg text-xs flex items-center gap-1 cursor-pointer"
            >
              <Info className="w-3.5 h-3.5" />
              {showDiagnostics ? 'إخفاء التشخيص' : 'تشخيص الكاميرا'}
            </button>
          </div>

          {showDiagnostics && (
            <div className="bg-[#111823] border border-white/10 rounded-lg p-3 text-[10px] text-left text-slate-300 font-mono w-full max-w-sm space-y-1 mt-2 overflow-x-auto dir-ltr">
              <div className="text-emerald-400 font-bold border-b border-white/10 pb-1 mb-1">CAMERA DIAGNOSTICS</div>
              <div>Secure Context: {diagnostics.secureContext}</div>
              <div>Protocol: {diagnostics.protocol}</div>
              <div>mediaDevices: {diagnostics.mediaDevices}</div>
              <div>Permission State: {diagnostics.permissionState}</div>
              <div>Video Inputs: {diagnostics.videoInputs}</div>
              <div>Embedded Iframe: {diagnostics.isEmbeddedIframe}</div>
              <div>Scanner State: {diagnostics.scannerState}</div>
              <div>Video Element: {diagnostics.videoElementCreated}</div>
              <div>videoWidth: {diagnostics.videoWidth}</div>
              <div>videoHeight: {diagnostics.videoHeight}</div>
              <div className="text-amber-300">Last Error: {diagnostics.lastError}</div>
            </div>
          )}

          <div className="pt-2 border-t border-white/10 w-full max-w-xs space-y-1.5">
            <span className="text-[10px] text-slate-400 block font-medium">أو تجربة باركود فوري للفحص:</span>
            <div className="flex flex-wrap gap-1.5 justify-center">
              {['7394586123476', '11752', '6221144223311'].map(b => (
                <button
                  key={b}
                  type="button"
                  onClick={() => {
                    fullCleanup();
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
            <p className="text-[11px] text-emerald-300 font-medium">ضع الباركود بالكامل داخل الإطار</p>
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
