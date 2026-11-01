import React from 'react';
import { Bell, Check, X, ExternalLink, Clock } from 'lucide-react';

export default function NotificationsModal({ isOpen, onClose, notifications = [], onMarkRead, onMarkAllRead, onNavigate }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
      <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-lg w-full border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-800/40">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400 rounded-lg">
              <Bell className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Notifications</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Procurement status and clarification alerts
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {notifications.some(n => !n.is_read) && (
              <button
                onClick={onMarkAllRead}
                className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline px-2 py-1"
              >
                Mark all as read
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Notifications List */}
        <div className="overflow-y-auto flex-1 divide-y divide-slate-100 dark:divide-slate-800 p-2">
          {notifications.length === 0 ? (
            <div className="text-center py-12 px-4">
              <Bell className="w-10 h-10 text-slate-300 dark:text-slate-700 mx-auto mb-2" />
              <p className="text-sm font-medium text-slate-500 dark:text-slate-400">No notifications yet</p>
              <p className="text-xs text-slate-400 dark:text-slate-500">Alerts regarding submissions and updates will appear here.</p>
            </div>
          ) : (
            notifications.map((n) => (
              <div
                key={n.id}
                className={`p-3.5 rounded-xl transition-colors flex items-start gap-3 ${
                  n.is_read
                    ? 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                    : 'bg-emerald-50/50 dark:bg-emerald-950/30 border border-emerald-100/50 dark:border-emerald-900/30'
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-900 dark:text-white truncate">
                      {n.title}
                    </span>
                    {!n.is_read && (
                      <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
                    )}
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5 leading-relaxed">
                    {n.message}
                  </p>
                  <div className="flex items-center gap-2 mt-2 text-[10px] text-slate-400">
                    <Clock className="w-3 h-3" />
                    <span>{new Date(n.created_at).toLocaleString()}</span>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  {!n.is_read && (
                    <button
                      onClick={() => onMarkRead(n.id)}
                      title="Mark as read"
                      className="p-1.5 text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 rounded-md"
                    >
                      <Check className="w-4 h-4" />
                    </button>
                  )}
                  {n.link && (
                    <button
                      onClick={() => {
                        onClose();
                        onNavigate(n.link);
                      }}
                      title="Go to item"
                      className="p-1.5 text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 rounded-md"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
