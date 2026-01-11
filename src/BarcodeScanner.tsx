import { useEffect } from 'react';
import {
  Html5QrcodeScanner,
  Html5QrcodeSupportedFormats,
  Html5QrcodeScanType,
} from 'html5-qrcode';

type Props = {
  onDetected: (code: string) => void;
  onClose: () => void;
};

const cleanBarcode = (raw: string): string =>
  String(raw).replace(/[^\d]/g, '').trim();

export function BarcodeScanner({ onDetected, onClose }: Props) {
  useEffect(() => {
    const formatsToSupport = [
      Html5QrcodeSupportedFormats.EAN_13,
      Html5QrcodeSupportedFormats.EAN_8,
      Html5QrcodeSupportedFormats.UPC_A,
      Html5QrcodeSupportedFormats.UPC_E,
    ];

    // Certaines versions de html5-qrcode ne typent pas toutes les options → cast "any"
    const config: any = {
      fps: 12,

      // zone rectangulaire (plus large) = mieux pour codes-barres
      qrbox: { width: 360, height: 160 },

      formatsToSupport,
      showTorchButtonIfSupported: true,

      // mobile : caméra arrière (si possible)
      videoConstraints: { facingMode: { ideal: 'environment' } },

      // UX : uniquement scan caméra
      supportedScanTypes: [Html5QrcodeScanType.SCAN_TYPE_CAMERA],

      // accélère si BarcodeDetector est dispo
      experimentalFeatures: { useBarCodeDetectorIfSupported: true },

      // évite de re-choisir la caméra à chaque fois
      rememberLastUsedCamera: true,
    };

    const scanner = new Html5QrcodeScanner('barcode-reader', config, false);

    const onScanSuccess = (decodedText: string) => {
      const cleaned = cleanBarcode(decodedText);

      // EAN-8 (8), UPC-A (12), EAN-13 (13)
      if (![8, 12, 13].includes(cleaned.length)) return;

      void scanner.clear().catch(() => {});
      onDetected(cleaned);
      onClose();
    };

    const onScanError = (_error: unknown) => {
      // ignore
    };

    scanner.render(onScanSuccess, onScanError);

    return () => {
      void scanner.clear().catch(() => {});
    };
  }, [onDetected, onClose]);

  return (
    <div className="scanner-backdrop">
      <div className="scanner-modal">
        <div className="scanner-header">
          <span>Scanner un code-barres</span>
          <button type="button" className="scanner-close" onClick={onClose}>
            ✕
          </button>
        </div>

        <div id="barcode-reader" style={{ width: '100%', minHeight: 260 }} />
      </div>
    </div>
  );
}
