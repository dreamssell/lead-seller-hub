// Advanced QR Code generator with size, error correction, logo and PNG/SVG download.
import { useRef, useState } from 'react';
import { QRCodeCanvas, QRCodeSVG } from 'qrcode.react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Download, QrCode } from 'lucide-react';

type Level = 'L' | 'M' | 'Q' | 'H';

export function QrCodeStudio({
  value,
  filename = 'qr-code',
  version,
  lastPublishedAt,
}: {
  value: string;
  filename?: string;
  /** Bumped on every publish to force a fresh QR Code render and download filename. */
  version?: number;
  /** ISO timestamp of last publish — shown to the user so they know when to redistribute. */
  lastPublishedAt?: string | null;
}) {
  const [size, setSize] = useState(280);
  const [level, setLevel] = useState<Level>('M');
  const [fg, setFg] = useState('#000000');
  const [bg, setBg] = useState('#FFFFFF');
  const [logo, setLogo] = useState<string | null>(null);
  const [logoSize, setLogoSize] = useState(56);
  const canvasWrapRef = useRef<HTMLDivElement>(null);
  const svgWrapRef = useRef<HTMLDivElement>(null);
  const versionKey = version ?? 0;
  const versionedFilename = version && version > 0 ? `${filename}-v${version}` : filename;

  const onLogoFile = (f: File | null) => {
    if (!f) { setLogo(null); return; }
    const reader = new FileReader();
    reader.onload = () => setLogo(reader.result as string);
    reader.readAsDataURL(f);
  };

  const downloadPNG = () => {
    const canvas = canvasWrapRef.current?.querySelector('canvas');
    if (!canvas) return;
    const a = document.createElement('a');
    a.download = `${filename}.png`;
    a.href = canvas.toDataURL('image/png');
    a.click();
  };

  const downloadSVG = () => {
    const svg = svgWrapRef.current?.querySelector('svg');
    if (!svg) return;
    const serializer = new XMLSerializer();
    const xml = serializer.serializeToString(svg);
    const blob = new Blob([xml], { type: 'image/svg+xml;charset=utf-8' });
    const a = document.createElement('a');
    a.download = `${filename}.svg`;
    a.href = URL.createObjectURL(blob);
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  const imageSettings = logo ? { src: logo, height: logoSize, width: logoSize, excavate: true } : undefined;

  return (
    <Card>
      <CardContent className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="flex flex-col items-center justify-center">
          <div ref={canvasWrapRef} className="p-3 rounded-md" style={{ background: bg }}>
            <QRCodeCanvas value={value} size={size} level={level} fgColor={fg} bgColor={bg} imageSettings={imageSettings} />
          </div>
          {/* Hidden SVG mirror for SVG download */}
          <div ref={svgWrapRef} className="hidden">
            <QRCodeSVG value={value} size={size} level={level} fgColor={fg} bgColor={bg} imageSettings={imageSettings} />
          </div>
          <div className="flex gap-2 mt-3">
            <Button variant="outline" size="sm" onClick={downloadPNG}><Download className="w-4 h-4 mr-1" />PNG</Button>
            <Button variant="outline" size="sm" onClick={downloadSVG}><Download className="w-4 h-4 mr-1" />SVG</Button>
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold"><QrCode className="w-4 h-4" />Personalização avançada</div>

          <div>
            <Label className="text-xs flex justify-between"><span>Tamanho</span><span className="text-muted-foreground">{size}px</span></Label>
            <Slider value={[size]} min={120} max={600} step={20} onValueChange={(v) => setSize(v[0])} />
          </div>

          <div>
            <Label className="text-xs">Nível de correção</Label>
            <Select value={level} onValueChange={(v) => setLevel(v as Level)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="L">Baixo (L · ~7%)</SelectItem>
                <SelectItem value="M">Médio (M · ~15%)</SelectItem>
                <SelectItem value="Q">Alto (Q · ~25%)</SelectItem>
                <SelectItem value="H">Máximo (H · ~30%) — recomendado com logo</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div><Label className="text-xs">Cor frente</Label><input type="color" value={fg} onChange={e => setFg(e.target.value)} className="h-9 w-full rounded cursor-pointer" /></div>
            <div><Label className="text-xs">Cor fundo</Label><input type="color" value={bg} onChange={e => setBg(e.target.value)} className="h-9 w-full rounded cursor-pointer" /></div>
          </div>

          <div>
            <Label className="text-xs">Logo do parceiro (PNG/SVG)</Label>
            <Input type="file" accept="image/*" onChange={(e) => onLogoFile(e.target.files?.[0] || null)} />
            <p className="text-[10px] text-muted-foreground mt-1">Use nível H para garantir leitura com logo no centro.</p>
          </div>

          {logo && (
            <div>
              <Label className="text-xs flex justify-between"><span>Tamanho do logo</span><span className="text-muted-foreground">{logoSize}px</span></Label>
              <Slider value={[logoSize]} min={32} max={120} step={4} onValueChange={(v) => setLogoSize(v[0])} />
              <Button variant="ghost" size="sm" className="mt-1 h-7 text-xs" onClick={() => setLogo(null)}>Remover logo</Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
