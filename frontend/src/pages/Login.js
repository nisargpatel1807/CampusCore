import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";
import "../index.css";

export default function Login() {
  const { role } = useParams();
  const navigate = useNavigate();
  const [id_no, setId] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [showForgot, setShowForgot] = useState(false);
  const [forgotForm, setForgotForm] = useState({ id_no: "", email: "", newPassword: "", confirmPassword: "" });
  const [forgotLoading, setForgotLoading] = useState(false);

  useEffect(() => {
    const rememberedId = localStorage.getItem(`rememberedLoginId_${role}`) || "";
    setId(rememberedId);
  }, [role]);

  const colors = { admin: "orange", teacher: "purple", student: "blue" };
  const color = colors[role] || "blue";
  const roleName = role ? role.charAt(0).toUpperCase() + role.slice(1) : "User";
  const theme = role === "admin"
    ? { header: "bg-orange-700", button: "bg-orange-700 hover:bg-orange-800" }
    : role === "teacher"
      ? { header: "bg-purple-700", button: "bg-purple-700 hover:bg-purple-800" }
      : { header: "bg-blue-700", button: "bg-blue-700 hover:bg-blue-800" };

  const handleLogin = async () => {
    const cleanId = id_no.trim();
    if (!cleanId || !password) { alert("Please enter your ID and password."); return; }
    try {
      setLoading(true);
      const res = await axios.post("http://localhost:5000/api/auth/login", { id_no: cleanId, password, role });
      localStorage.setItem("token", res.data.token);
      localStorage.setItem("user", JSON.stringify(res.data.user));
      if (rememberMe) localStorage.setItem(`rememberedLoginId_${role}`, cleanId);
      else localStorage.removeItem(`rememberedLoginId_${role}`);
      navigate(role === "admin" ? "/admin/dashboard" : role === "teacher" ? "/teacher/dashboard" : "/student/dashboard");
    } catch (err) { alert(err.response?.data?.message || "Login failed. Please check your credentials."); }
    finally { setLoading(false); }
  };

  const handleForgotPassword = async (e) => {
    e.preventDefault();
    const email = forgotForm.email.trim().toLowerCase();
    const newPassword = forgotForm.newPassword;
    if (forgotForm.id_no.trim().length < 3) return alert("Please enter a valid ID.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return alert("Please enter a valid email address.");
    if (newPassword.length < 6 || newPassword.length > 100 || !newPassword.trim()) return alert("New password must be 6–100 characters.");
    if (newPassword !== forgotForm.confirmPassword) return alert("New password and confirm password do not match.");
    try {
      setForgotLoading(true);
      const res = await axios.post("http://localhost:5000/api/auth/forgot-password", { id_no: forgotForm.id_no.trim(), email, newPassword });
      alert(res.data.message || "Password reset successfully.");
      setForgotForm({ id_no: "", email: "", newPassword: "", confirmPassword: "" });
      setShowForgot(false);
    } catch (err) { alert(err.response?.data?.message || "Unable to reset password."); }
    finally { setForgotLoading(false); }
  };

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl overflow-hidden">
        <div className={`${theme.header} text-white p-6 text-center`}>
          <div className="text-4xl mb-2">🎓</div><h1 className="text-2xl font-bold">CampusCore</h1><p className="text-sm opacity-90">{roleName} Login</p>
        </div>
        <div className="p-6 space-y-4">
          <div><label className="text-sm font-semibold text-gray-700">ID / Enrollment Number</label><input value={id_no} onChange={(e)=>setId(e.target.value)} className="w-full mt-1 border rounded-lg p-3" placeholder="Enter your ID" /></div>
          <div><label className="text-sm font-semibold text-gray-700">Password</label><input type="password" value={password} onChange={(e)=>setPassword(e.target.value)} onKeyDown={(e)=>e.key==="Enter"&&handleLogin()} className="w-full mt-1 border rounded-lg p-3" placeholder="Enter your password" /></div>
          <div className="flex items-center justify-between"><label className="flex items-center gap-2 text-sm text-gray-600"><input type="checkbox" checked={rememberMe} onChange={(e)=>setRememberMe(e.target.checked)} /> Remember Me</label><button type="button" onClick={()=>{setForgotForm((p)=>({...p,id_no}));setShowForgot(true);}} className="text-sm text-blue-600 hover:underline font-semibold">Forgot Password?</button></div>
          <button onClick={handleLogin} disabled={loading} className={`${theme.button} w-full disabled:opacity-50 text-white py-3 rounded-lg font-bold transition`}>{loading?"Signing in...":"Login"}</button>
        </div>
      </div>

      {showForgot && <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50"><div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6"><div className="flex justify-between items-center mb-4"><div><h2 className="text-lg font-bold text-gray-800">🔐 Forgot Password</h2><p className="text-xs text-gray-500">Reset your {roleName.toLowerCase()} account password.</p></div><button onClick={()=>setShowForgot(false)} className="text-xl text-gray-400">✕</button></div><form onSubmit={handleForgotPassword} className="space-y-3"><input value={forgotForm.id_no} onChange={(e)=>setForgotForm({...forgotForm,id_no:e.target.value})} className="w-full border rounded-lg p-3" placeholder="ID / Enrollment Number" required /><input type="email" value={forgotForm.email} onChange={(e)=>setForgotForm({...forgotForm,email:e.target.value})} className="w-full border rounded-lg p-3" placeholder="Registered Email" required /><input type="password" value={forgotForm.newPassword} onChange={(e)=>setForgotForm({...forgotForm,newPassword:e.target.value})} className="w-full border rounded-lg p-3" placeholder="New Password" required minLength={6} /><input type="password" value={forgotForm.confirmPassword} onChange={(e)=>setForgotForm({...forgotForm,confirmPassword:e.target.value})} className="w-full border rounded-lg p-3" placeholder="Confirm New Password" required minLength={6} /><button disabled={forgotLoading} className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white py-3 rounded-lg font-bold">{forgotLoading?"Resetting...":"Reset Password"}</button></form></div></div>}
    </div>
  );
}
