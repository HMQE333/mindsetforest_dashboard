import { useState, useRef } from "react";
import { Upload, Sparkles, FileText, X } from "lucide-react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Props {
  onExtracted: (extracted: Record<string, number>) => void;
  onFileSelected: (file: File | null) => void;
}

export default function LabExtractDropzone({ onExtracted, onFileSelected }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = (f: File | null) => {
    setFile(f);
    onFileSelected(f);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
  };

  const fileToBase64 = (f: File): Promise<string> =>
    new Promise((res, rej) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        res(result.split(",")[1] ?? "");
      };
      reader.onerror = rej;
      reader.readAsDataURL(f);
    });

  const handleExtract = async () => {
    if (!file) return;
    setExtracting(true);
    try {
      const base64 = await fileToBase64(file);
      const { data, error } = await supabase.functions.invoke("ai-health-extract", {
        body: { fileBase64: base64, mimeType: file.type, fileName: file.name },
      });
      if (error) throw error;
      const extracted = (data?.extracted ?? {}) as Record<string, number>;
      const count = Object.keys(extracted).length;
      if (count === 0) {
        toast.warning("Couldn't extract any values. Try a clearer image or PDF");
      } else {
        onExtracted(extracted);
        toast.success(`Extracted ${count} value${count === 1 ? "" : "s"} from your report ✨`);
      }
    } catch (err: any) {
      console.error("Lab extract error:", err);
      toast.error(err?.message || "AI extraction failed");
    } finally {
      setExtracting(false);
    }
  };

  return (
    <div className="space-y-2">
      <div
        onDragOver={e => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={`relative border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all ${
          dragOver
            ? "border-primary/60 bg-primary/5"
            : file
            ? "border-primary/30 bg-muted/20"
            : "border-border bg-muted/10 hover:border-primary/40"
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,image/*"
          className="hidden"
          onChange={e => handleFile(e.target.files?.[0] ?? null)}
        />
        {file ? (
          <div className="flex items-center justify-center gap-2 text-sm">
            <FileText className="w-4 h-4 text-primary" />
            <span className="font-semibold text-foreground truncate max-w-[220px]">{file.name}</span>
            <button
              type="button"
              onClick={e => {
                e.stopPropagation();
                handleFile(null);
              }}
              className="text-muted-foreground hover:text-foreground"
              aria-label="Remove file"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-1.5 text-muted-foreground">
            <Upload className="w-5 h-5" />
            <div className="text-xs">
              <span className="font-semibold text-foreground">Drop lab report</span> or click to browse
            </div>
            <div className="text-[10px] opacity-70">PDF or image · stored privately</div>
          </div>
        )}
      </div>

      {file && (
        <motion.button
          type="button"
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          onClick={handleExtract}
          disabled={extracting}
          className="w-full py-2.5 rounded-xl gradient-purple text-primary-foreground font-bold text-sm glow-sm hover:opacity-90 transition-all disabled:opacity-50 inline-flex items-center justify-center gap-2"
        >
          <Sparkles className="w-4 h-4" />
          {extracting ? "Reading report…" : "Extract with AI"}
        </motion.button>
      )}
    </div>
  );
}