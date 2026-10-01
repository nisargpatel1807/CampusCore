import React, { useEffect, useRef, useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";

const API = "http://localhost:5000/api/notifications";

export default function NotificationBell() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const ref = useRef(null);
  const token = localStorage.getItem("token");
  const authConfig = { headers: { Authorization: `Bearer ${token}` } };

  const fetchNotifications = async () => {
    if (!token) return;
    try {
      const r = await axios.get(API, authConfig);
      setItems(Array.isArray(r.data.notifications) ? r.data.notifications : []);
      setUnread(Number(r.data.unreadCount || 0));
    } catch (e) {
      console.error("Notifications error:", e);
    }
  };

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 20000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const handleOutside = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);

  const markRead = async (item) => {
    try {
      await axios.put(`${API}/${item._id}/read`, {}, authConfig);
      setItems((prev) => prev.map((n) => n._id === item._id ? { ...n, isRead: true } : n));
      setUnread((prev) => Math.max(0, prev - (item.isRead ? 0 : 1)));
    } catch (e) {
      console.error("Mark notification read error:", e);
    }

    // Only navigate. Never open notification attachments automatically.
    if (item.link) {
      setOpen(false);
      navigate(item.link);
    }
  };

  const markAllRead = async () => {
    try {
      await axios.put(`${API}/read-all`, {}, authConfig);
      setItems((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnread(0);
    } catch (e) {
      console.error("Mark all notifications error:", e);
    }
  };

  const del = async (id) => {
    try {
      const current = items.find((n) => n._id === id);
      await axios.delete(`${API}/${id}`, authConfig);
      setItems((prev) => prev.filter((n) => n._id !== id));
      if (current && !current.isRead) setUnread((prev) => Math.max(0, prev - 1));
    } catch (e) {
      console.error("Delete notification error:", e);
    }
  };

  const getIcon = (type = "") => {
    const value = String(type).toUpperCase();
    if (value.includes("ASSIGNMENT")) return "📝";
    if (value.includes("MATERIAL")) return "📄";
    if (value.includes("QUIZ")) return "🎯";
    if (value.includes("HELPDESK")) return "🛠️";
    if (value.includes("ATTENDANCE")) return "⚠️";
    if (value.includes("CALENDAR") || value.includes("CAMPUS") || value.includes("NOTICE") || value.includes("EVENT")) return "📢";
    return "🔔";
  };

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => { const next = !open; setOpen(next); if (next) fetchNotifications(); }} className="relative w-10 h-10 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition" aria-label="Notifications">
        <span className="text-lg">🔔</span>
        {unread > 0 && <span className="absolute -top-1 -right-1 min-w-5 h-5 px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center border-2 border-white">{unread > 99 ? "99+" : unread}</span>}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-96 max-w-[90vw] bg-white border rounded-2xl shadow-2xl z-[70] overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <div><p className="font-bold text-gray-800">Notifications</p><p className="text-[10px] text-gray-400">Latest campus updates</p></div>
            {items.length > 0 && <button type="button" onClick={markAllRead} className="text-[11px] text-blue-600 font-semibold hover:underline">Mark all read</button>}
          </div>

          <div className="max-h-[430px] overflow-y-auto">
            {items.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-10">No notifications yet.</p>
            ) : items.map((item) => (
              <div key={item._id} className={`p-3 border-b last:border-b-0 hover:bg-gray-50 ${item.isRead ? "" : "bg-blue-50/50"}`}>
                <button type="button" onClick={() => markRead(item)} className="text-left w-full">
                  <div className="flex items-start gap-2">
                    <span className="text-sm">{getIcon(item.type)}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-gray-900">{item.title}</p>
                      <p className="text-[11px] text-gray-600 mt-0.5">{item.message}</p>
                      <p className="text-[9px] text-gray-400 mt-1">{new Date(item.createdAt).toLocaleString()}</p>
                      {item.attachmentName && <p className="text-[10px] text-purple-700 mt-1 truncate">📎 {item.attachmentName}</p>}
                      {item.link && <p className="text-[9px] text-blue-600 font-semibold mt-1">Click to open relevant section →</p>}
                    </div>
                    {!item.isRead && <span className="w-2 h-2 bg-blue-600 rounded-full mt-1" />}
                  </div>
                </button>
                <div className="flex justify-end mt-1"><button type="button" onClick={() => del(item._id)} className="text-[9px] text-gray-400 hover:text-red-500">Delete</button></div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
