"use client";

import { useEffect, useState } from "react";
import { StoragePanel } from "@/components/StoragePanel";

type MaskedSettings = {
  llmBaseUrl: string;
  llmModel: string;
  ttsProvider: string;
  hasLlmApiKey: boolean;
  hasPexelsApiKey: boolean;
  hasPixabayApiKey: boolean;
};

type FormState = {
  llmBaseUrl: string;
  llmModel: string;
  llmApiKey: string;
  pexelsApiKey: string;
  pixabayApiKey: string;
};

type LlmTestResult = { ok: boolean; reply?: string; error?: string };
type MaterialsTestResult = Record<string, { ok: boolean; count?: number; error?: string }>;

const emptyForm: FormState = {
  llmBaseUrl: "",
  llmModel: "",
  llmApiKey: "",
  pexelsApiKey: "",
  pixabayApiKey: "",
};

export default function SettingsPage() {
  const [saved, setSaved] = useState<MaskedSettings | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );
  const [testingLlm, setTestingLlm] = useState(false);
  const [llmTest, setLlmTest] = useState<LlmTestResult | null>(null);
  const [testingMaterials, setTestingMaterials] = useState(false);
  const [materialsTest, setMaterialsTest] = useState<MaterialsTestResult | null>(null);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((data: MaskedSettings) => {
        setSaved(data);
        setForm((f) => ({
          ...f,
          llmBaseUrl: data.llmBaseUrl,
          llmModel: data.llmModel,
        }));
      });
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("saving");
    const res = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (!res.ok) {
      setStatus("error");
      return;
    }
    const data: MaskedSettings = await res.json();
    setSaved(data);
    setForm((f) => ({ ...f, llmApiKey: "", pexelsApiKey: "", pixabayApiKey: "" }));
    setStatus("saved");
  }

  async function handleTestLlm() {
    setTestingLlm(true);
    setLlmTest(null);
    try {
      const res = await fetch("/api/settings/test-llm", { method: "POST" });
      setLlmTest(await res.json());
    } finally {
      setTestingLlm(false);
    }
  }

  async function handleTestMaterials() {
    setTestingMaterials(true);
    setMaterialsTest(null);
    try {
      const res = await fetch("/api/settings/test-materials", { method: "POST" });
      setMaterialsTest(await res.json());
    } finally {
      setTestingMaterials(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl p-8">
      <h1 className="text-xl font-semibold">设置</h1>
      <p className="mt-1 text-sm text-neutral-500">
        配置你自己的 LLM 接口和素材源 API Key。密钥保存后不会再显示明文。测试连接用的是当前已保存的配置，改完记得先保存再测试。
      </p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-6">
        <fieldset className="space-y-3">
          <legend className="text-sm font-medium">LLM（拆分镜头用，OpenAI 兼容接口）</legend>
          <Field
            label="Base URL"
            value={form.llmBaseUrl}
            onChange={(v) => setForm((f) => ({ ...f, llmBaseUrl: v }))}
            placeholder="https://your-provider.example.com/v1"
          />
          <Field
            label="Model"
            value={form.llmModel}
            onChange={(v) => setForm((f) => ({ ...f, llmModel: v }))}
            placeholder="grok-3"
          />
          <Field
            label="API Key"
            secret
            hasValue={saved?.hasLlmApiKey}
            value={form.llmApiKey}
            onChange={(v) => setForm((f) => ({ ...f, llmApiKey: v }))}
          />
          <div>
            <button
              type="button"
              onClick={handleTestLlm}
              disabled={testingLlm}
              className="rounded border border-neutral-300 px-3 py-1.5 text-xs disabled:opacity-40 dark:border-neutral-700"
            >
              {testingLlm ? "测试中…" : "测试连接"}
            </button>
            {llmTest && (
              <span className={`ml-2 text-xs ${llmTest.ok ? "text-green-600" : "text-red-600"}`}>
                {llmTest.ok ? `连接正常，回复：${llmTest.reply}` : llmTest.error}
              </span>
            )}
          </div>
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="text-sm font-medium">素材源</legend>
          <Field
            label="Pexels API Key"
            secret
            hasValue={saved?.hasPexelsApiKey}
            value={form.pexelsApiKey}
            onChange={(v) => setForm((f) => ({ ...f, pexelsApiKey: v }))}
          />
          <Field
            label="Pixabay API Key"
            secret
            hasValue={saved?.hasPixabayApiKey}
            value={form.pixabayApiKey}
            onChange={(v) => setForm((f) => ({ ...f, pixabayApiKey: v }))}
          />
          <div>
            <button
              type="button"
              onClick={handleTestMaterials}
              disabled={testingMaterials}
              className="rounded border border-neutral-300 px-3 py-1.5 text-xs disabled:opacity-40 dark:border-neutral-700"
            >
              {testingMaterials ? "测试中…" : "测试连接"}
            </button>
            {materialsTest && (
              <div className="ml-2 mt-1 inline-block align-top text-xs">
                {Object.entries(materialsTest).map(([provider, r]) => (
                  <div key={provider} className={r.ok ? "text-green-600" : "text-red-600"}>
                    {provider}: {r.ok ? `正常，搜到 ${r.count} 条结果` : r.error}
                  </div>
                ))}
              </div>
            )}
          </div>
        </fieldset>

        <div className="border-t border-neutral-200 pt-6 dark:border-neutral-800">
          <StoragePanel />
        </div>

        <button
          type="submit"
          disabled={status === "saving"}
          className="rounded bg-neutral-900 px-4 py-2 text-sm text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900"
        >
          {status === "saving" ? "保存中…" : "保存"}
        </button>
        {status === "saved" && (
          <span className="ml-3 text-sm text-green-600">已保存</span>
        )}
        {status === "error" && (
          <span className="ml-3 text-sm text-red-600">保存失败</span>
        )}
      </form>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  secret,
  hasValue,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  secret?: boolean;
  hasValue?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-neutral-500">{label}</span>
      <input
        type={secret ? "password" : "text"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={
          secret
            ? hasValue
              ? "已设置，留空则保持不变"
              : "尚未设置"
            : placeholder
        }
        className="w-full rounded border border-neutral-300 bg-transparent px-3 py-2 text-sm outline-none focus:border-neutral-500 dark:border-neutral-700"
      />
    </label>
  );
}
