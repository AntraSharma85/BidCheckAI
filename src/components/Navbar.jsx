import React, { useState } from 'react';
import {
  ShieldCheck,
  Moon,
  Sun,
  Bell,
  User,
  LogOut,
  Menu,
  X,
  FileText,
  Scale,
  Users,
  Activity,
  CheckCircle2,
  Building2,
  BadgeCheck,
  UserCheck
} from 'lucide-react';

export default function Navbar({
  user,
  onLogout,
  theme,
  onToggleTheme,
  activeTab,
  setActiveTab,
  unreadCount = 0,
  onOpenNotifications
}) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);

  const isOfficer = user?.role === 'officer';

  // Professional role-based navigation as specified in Requirements 3 & 5
  const navItems = isOfficer
    ? [
        { id: 'dashboard', label: 'Dashboard', icon: Activity },
        { id: 'tenders', label: 'Manage Tenders', icon: FileText },
        { id: 'bids', label: 'Submitted Bids', icon: ShieldCheck },
        { id: 'collusion', label: 'Bid Risk Analysis', icon: Scale },
        { id: 'approvals', label: 'Approvals & Verification', icon: UserCheck },
        { id: 'audit', label: 'Audit Trail', icon: Users }
      ]
    : [
        { id: 'catalog', label: 'Open Tenders', icon: FileText },
        { id: 'my_bids', label: 'My Applications', icon: ShieldCheck },
        { id: 'notifications', label: 'Notifications', icon: Bell, badge: unreadCount }
      ];

  return (
    <header className="sticky top-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur border-b border-emerald-100 dark:border-slate-800 shadow-xs transition-colors">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Brand */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setActiveTab(isOfficer ? 'dashboard' : 'catalog')}
              className="flex items-center gap-2.5 text-left focus:outline-hidden"
            >
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-700 via-emerald-600 to-teal-500 flex items-center justify-center text-white shadow-md shadow-emerald-700/20">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-lg text-slate-900 dark:text-white tracking-tight">
                    BidCheck<span className="text-emerald-600 dark:text-emerald-400">AI</span>
                  </span>
                  <span className="px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 rounded-sm">
                    {isOfficer ? 'Authority' : 'Vendor'}
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 hidden sm:block">
                  Public Procurement Integrity & Compliance System
                </p>
              </div>
            </button>
          </div>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    if (item.id === 'notifications') {
                      setActiveTab('notifications');
                    } else {
                      setActiveTab(item.id);
                    }
                  }}
                  className={`flex items-center gap-2 px-3.5 py-2 text-sm font-medium rounded-lg transition-all relative ${
                    isActive
                      ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 font-semibold'
                      : 'text-slate-600 dark:text-slate-300 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${isActive ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}`} />
                  <span>{item.label}</span>
                  {item.badge > 0 && (
                    <span className="ml-1 px-1.5 py-0.2 bg-emerald-600 text-white text-[10px] font-bold rounded-full">
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          {/* Right Controls */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Theme Toggle (Green Light / Dark) */}
            <button
              onClick={onToggleTheme}
              aria-label="Toggle Light and Dark Mode"
              className="p-2 rounded-lg text-slate-500 dark:text-slate-300 hover:bg-emerald-50 dark:hover:bg-slate-800 transition-colors"
              title={theme === 'dark' ? 'Switch to Green Light Mode' : 'Switch to Dark Mode'}
            >
              {theme === 'dark' ? (
                <Sun className="w-5 h-5 text-amber-400" />
              ) : (
                <Moon className="w-5 h-5 text-emerald-700" />
              )}
            </button>

            {/* Notifications Bell */}
            <button
              onClick={onOpenNotifications}
              className="relative p-2 rounded-lg text-slate-500 dark:text-slate-300 hover:bg-emerald-50 dark:hover:bg-slate-800 transition-colors"
              title="View Alerts"
            >
              <Bell className="w-5 h-5 text-slate-600 dark:text-slate-300" />
              {unreadCount > 0 && (
                <span className="absolute top-1.5 right-1.5 w-4 h-4 bg-emerald-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center animate-pulse">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>

            {/* Professional Profile Dropdown (Requirement B) */}
            <div className="relative">
              <button
                onClick={() => setUserDropdownOpen(!userDropdownOpen)}
                className="flex items-center gap-2 p-1.5 pl-2 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-emerald-500 dark:hover:border-emerald-500 transition-all text-left"
              >
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white ${
                  isOfficer ? 'bg-emerald-600' : 'bg-teal-600'
                }`}>
                  {user?.full_name ? user.full_name[0] : 'U'}
                </div>
                <div className="hidden sm:block">
                  <div className="text-xs font-semibold text-slate-800 dark:text-slate-100 max-w-[120px] truncate">
                    {user?.full_name}
                  </div>
                  <div className="text-[10px] text-emerald-700 dark:text-emerald-400 uppercase tracking-wider font-semibold">
                    {isOfficer ? 'Officer' : 'Vendor'}
                  </div>
                </div>
              </button>

              {/* Profile Dropdown Menu - Clean, Professional */}
              {userDropdownOpen && (
                <div className="absolute right-0 mt-2 w-64 bg-white dark:bg-slate-900 rounded-xl shadow-xl border border-slate-200 dark:border-slate-800 py-2 z-50 animate-in fade-in slide-in-from-top-2">
                  <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800">
                    <div className="flex items-center justify-between gap-1.5 mb-1.5">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                        isOfficer
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                          : 'bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-300'
                      }`}>
                        {isOfficer ? 'Procurement Officer' : 'Registered Bidder'}
                      </span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        user?.verification_status === 'VERIFIED' || user?.verification_status === 'APPROVED'
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                          : user?.verification_status === 'SUSPENDED'
                          ? 'bg-rose-100 text-rose-800'
                          : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                      }`}>
                        {user?.verification_status || 'VERIFIED'}
                      </span>
                    </div>
                    <p className="text-sm font-bold text-slate-900 dark:text-white truncate">{user?.full_name}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{user?.email}</p>
                    <p className="text-xs text-slate-600 dark:text-slate-300 font-medium mt-1 truncate">
                      {user?.organization || (isOfficer ? 'National Procurement Authority' : 'Registered Enterprise')}
                    </p>
                    {isOfficer && user?.government_id_ref && (
                      <p className="text-[10px] text-slate-400 font-mono mt-0.5 truncate">
                        ID: {user.government_id_ref}
                      </p>
                    )}
                    {!isOfficer && user?.cin_llpin && (
                      <p className="text-[10px] text-slate-400 font-mono mt-0.5 truncate">
                        CIN/LLPIN: {user.cin_llpin}
                      </p>
                    )}
                  </div>

                  <div className="pt-1">
                    <button
                      onClick={() => {
                        onLogout();
                        setUserDropdownOpen(false);
                      }}
                      className="w-full text-left px-4 py-2.5 text-xs text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 flex items-center gap-2 transition-colors font-medium"
                    >
                      <LogOut className="w-4 h-4" />
                      Sign Out
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Mobile Hamburger Button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              aria-label="Toggle navigation menu"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Drawer Menu */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 pt-2 pb-4 space-y-1 shadow-lg">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  setActiveTab(item.id);
                  setMobileMenuOpen(false);
                }}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 text-sm font-medium rounded-lg transition-colors ${
                  isActive
                    ? 'bg-emerald-50 dark:bg-emerald-950/70 text-emerald-700 dark:text-emerald-400 font-semibold'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon className={`w-5 h-5 ${isActive ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}`} />
                  <span>{item.label}</span>
                </div>
                {item.badge > 0 && (
                  <span className="px-2 py-0.5 bg-emerald-600 text-white text-xs font-bold rounded-full">
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </header>
  );
}
