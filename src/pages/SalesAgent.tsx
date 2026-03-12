import { useBrand } from "../context/BrandContext";
import { motion } from "motion/react";
import { PhoneCall, Copy, CheckCircle2 } from "lucide-react";
import { useState } from "react";

export default function SalesAgent() {
  const brand = useBrand();
  const [copied, setCopied] = useState(false);
  
  const webhookUrl = `${import.meta.env.VITE_APP_URL || window.location.origin}/api/twilio/sms`;

  const copyToClipboard = () => {
    navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-4 md:p-8 max-w-4xl mx-auto"
    >
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-white mb-2">Twilio Sales Agent</h1>
        <p className="text-zinc-400">Deploy an AI sales agent via SMS using Twilio.</p>
      </div>

      <div className="bg-zinc-950 border border-zinc-800 rounded-2xl p-8 mb-8">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-12 h-12 bg-emerald-500/10 rounded-xl flex items-center justify-center text-emerald-400">
            <PhoneCall className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-white">SMS Webhook Configuration</h2>
            <p className="text-sm text-zinc-400">Connect your Twilio number to this workspace.</p>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
            <h3 className="text-sm font-medium text-zinc-300 mb-4">1. Copy your Webhook URL</h3>
            <div className="flex items-center gap-3">
              <code className="flex-1 bg-black px-4 py-3 rounded-lg text-emerald-400 font-mono text-sm border border-zinc-800">
                {webhookUrl}
              </code>
              <button 
                onClick={copyToClipboard}
                className="bg-zinc-800 hover:bg-zinc-700 text-white p-3 rounded-lg transition-colors"
              >
                {copied ? <CheckCircle2 className="w-5 h-5 text-emerald-400" /> : <Copy className="w-5 h-5" />}
              </button>
            </div>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
            <h3 className="text-sm font-medium text-zinc-300 mb-4">2. Configure Twilio</h3>
            <ol className="list-decimal list-inside space-y-3 text-zinc-400 text-sm">
              <li>Log in to your Twilio Console</li>
              <li>Navigate to Phone Numbers &gt; Manage &gt; Active numbers</li>
              <li>Click on your desired phone number</li>
              <li>Scroll down to the <strong>Messaging</strong> section</li>
              <li>Under "A MESSAGE COMES IN", select "Webhook"</li>
              <li>Paste the URL above and select "HTTP POST"</li>
              <li>Save changes</li>
            </ol>
          </div>

          <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-xl p-6">
            <h3 className="text-sm font-medium text-indigo-300 mb-2">Agent Context</h3>
            <p className="text-sm text-indigo-200/70 leading-relaxed">
              When users text your Twilio number, the AI will respond as a sales agent for <strong>{brand.brandName}</strong>. 
              It will use your brand description ({brand.brandDescription}) and target audience ({brand.targetAudience}) to craft its responses.
            </p>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
