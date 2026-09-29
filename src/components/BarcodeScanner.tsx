import React, { useState } from 'react';
import { QrReader } from 'react-qr-reader';
import { AlertCircle } from 'lucide-react';

interface BarcodeScannerProps {
  onScanSuccess: (decodedText: string) => void;
  onScanError?: (errorMessage: string) => void;
}

export function BarcodeScanner({ onScanSuccess, onScanError }: BarcodeScannerProps) {
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="w-full relative rounded-lg overflow-hidden bg-black border border-emerald-500/30 p-2 flex flex-col items-center justify-center min-h-[220px]">
      <QrReader
        constraints={{ facingMode: 'environment' }}
        onResult={(result, error) => {
          if (result) {
            const text = typeof result.getText === 'function' ? result.getText() : String(result);
            if (text) {
              onScanSuccess(text);
            }
          }
          if (error && onScanError) {
            const msg = error?.message || '';
            if (!msg.includes('NotFound') && !msg.includes('No MultiFormat')) {
              onScanError(msg);
            }
          }
        }}
        containerStyle={{ width: '100%', height: '100%', minHeight: '220px' }}
        videoStyle={{ width: '100%', height: '100%', objectFit: 'cover' }}
      />
      {error && (
        <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center p-4 text-center">
          <AlertCircle className="w-8 h-8 text-amber-400 mb-2" />
          <p className="text-xs text-amber-200">{error}</p>
        </div>
      )}
    </div>
  );
}
