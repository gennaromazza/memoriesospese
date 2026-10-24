import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import StudioQuoteIdentityPreview from "@/components/StudioQuoteIdentityPreview";

export default function StudioSettingsPreviewE2EHarness() {
  const [name, setName] = useState("");
  const [logo, setLogo] = useState("");

  const handleLogoChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") setLogo(reader.result);
    };
    reader.readAsDataURL(file);
  };

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-6">
      <h1 className="text-xl font-semibold">Bozza impostazioni studio</h1>
      <div className="space-y-4 rounded-xl border bg-white p-5">
        <div className="space-y-2">
          <Label htmlFor="studio-name">Nome dello Studio</Label>
          <Input
            id="studio-name"
            data-testid="input-studio-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="es. Image Studio Photography"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="studio-logo">Logo dello Studio</Label>
          <Input
            id="studio-logo"
            data-testid="input-studio-logo"
            type="file"
            accept="image/*"
            onChange={handleLogoChange}
          />
        </div>
      </div>

      <section
        aria-label="Anteprima del preventivo"
        className="overflow-hidden rounded-xl border bg-white shadow-sm"
      >
        <div className="h-1.5 bg-[#6b7f6b]" />
        <StudioQuoteIdentityPreview name={name} logo={logo} />
      </section>
      <p role="status" data-testid="studio-settings-draft-status">
        Bozza non salvata
      </p>
    </main>
  );
}
