import { useEffect } from "react";
import {
  Html5QrcodeScanner,
  Html5QrcodeSupportedFormats,
  Html5QrcodeScanType,
} from "html5-qrcode";

type Props = {
  onDetected: (code: string) => void;
  onClose: () => void;
};

const cleanBarcode = (raw: string): string =>
  String(raw).replace(/[^\d]/g, "").trim();

type ScannerConfig = NonNullable<
  ConstructorParameters<typeof Html5QrcodeScanner>[1]
>;

const BARCODE_FORMATS = [
  Html5QrcodeSupportedFormats.EAN_13,
  Html5QrcodeSupportedFormats.EAN_8,
  Html5QrcodeSupportedFormats.UPC_A,
  Html5QrcodeSupportedFormats.UPC_E,
];

const scannerConfig: ScannerConfig = {
  fps: 12,
  qrbox: { width: 360, height: 160 },
  formatsToSupport: BARCODE_FORMATS,
  showTorchButtonIfSupported: true,
  videoConstraints: { facingMode: { ideal: "environment" } },
  supportedScanTypes: [Html5QrcodeScanType.SCAN_TYPE_CAMERA],
  experimentalFeatures: { useBarCodeDetectorIfSupported: true },
  rememberLastUsedCamera: true,
};

export function BarcodeScanner({ onDetected, onClose }: Props) {
  useEffect(() => {
    const scanner = new Html5QrcodeScanner(
      "barcode-reader",
      scannerConfig,
      false,
    );

    const onScanSuccess = (decodedText: string) => {
      const cleaned = cleanBarcode(decodedText);

      if (![8, 12, 13].includes(cleaned.length)) return;

      void scanner.clear().catch(() => {});
      onDetected(cleaned);
      onClose();
    };

    const onScanError = () => {};

    scanner.render(onScanSuccess, onScanError);

    return () => {
      void scanner.clear().catch(() => {});
    };
  }, [onDetected, onClose]);

  return (
    <div className="scanner-backdrop">
      <div className="scanner-modal">
        <div className="scanner-header">
          <div>
            <p className="scanner-kicker">Ajout rapide</p>
            <span>Scanner un produit</span>
          </div>
          <button
            type="button"
            className="scanner-close"
            aria-label="Fermer le scanner"
            onClick={onClose}
          >
            ✕
          </button>
        </div>
        <p className="scanner-copy">
          Cadre le code-barres : VPlacard complète la fiche dès qu'il reconnaît
          le produit.
        </p>

        <div id="barcode-reader" style={{ width: "100%", minHeight: 260 }} />
      </div>
    </div>
  );
}
