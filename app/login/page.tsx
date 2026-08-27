"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function Login() {
  const [pass, setPass] = useState("");
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: pass }),
      });
      
      if (res.ok) {
        router.push("/");
        router.refresh();
      } else {
        setError(true);
        setLoading(false);
      }
    } catch {
      setError(true);
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-rose-50/60 via-white to-sky-50/60 px-4">
      <form 
        onSubmit={handleLogin} 
        className="p-8 bg-white/70 backdrop-blur-xl border border-gray-100 shadow-xl rounded-2xl max-w-sm w-full"
      >
        <div className="flex justify-center mb-6">
          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-rose-200 to-sky-200 flex items-center justify-center shadow-sm">
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="white"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </div>
        </div>
        
        <h2 className="text-xl font-semibold mb-6 text-center text-gray-800">
          Enter Passkey
        </h2>
        
        <input
          type="password"
          value={pass}
          onChange={(e) => {
            setPass(e.target.value);
            setError(false);
          }}
          className="w-full p-3 border border-gray-200 rounded-xl mb-4 bg-white/50 focus:outline-none focus:ring-2 focus:ring-sky-200 transition-all text-gray-800"
          placeholder="Password..."
          required
        />
        
        {error && (
          <p className="text-rose-500 text-sm mb-4 text-center font-medium">
            You are not authorized to access this site.
          </p>
        )}
        
        <button 
          disabled={loading}
          className="w-full bg-gradient-to-r from-sky-400 to-sky-500 text-white p-3 rounded-xl hover:from-sky-500 hover:to-sky-600 transition-all font-medium disabled:opacity-70 shadow-sm"
        >
          {loading ? "Verifying..." : "Enter"}
        </button>
      </form>
    </div>
  );
}
