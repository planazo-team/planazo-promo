import React, { useState, useEffect } from 'react';
import { AppNotification } from '../types';
import { storeService } from '../services/store';
import { Bell, Sparkles, Calendar, Check, X, Tag } from 'lucide-react';

export const NotificationCenter: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [activeToast, setActiveToast] = useState<AppNotification | null>(null);

  const loadNotifications = () => {
    const list = storeService.getNotifications();
    setNotifications(list);
  };

  useEffect(() => {
    loadNotifications();
    const unsubscribe = storeService.subscribe(() => {
      const prevList = notifications;
      const newList = storeService.getNotifications();
      setNotifications(newList);

      // Check if a new unread notification arrived for Toast popup
      if (newList.length > prevList.length) {
        const latest = newList[0];
        if (!latest.read) {
          setActiveToast(latest);
          setTimeout(() => setActiveToast(null), 5000);
        }
      }
    });
    return () => unsubscribe();
  }, [notifications.length]);

  const unreadCount = notifications.filter(n => !n.read).length;

  const handleMarkAsRead = (id: string) => {
    storeService.markNotificationAsRead(id);
    loadNotifications();
  };

  const handleMarkAllRead = () => {
    storeService.markAllNotificationsAsRead();
    loadNotifications();
  };

  return (
    <div style={{ position: 'relative' }}>
      {/* Toast Notification Banner (HU-89 / HU-90) */}
      {activeToast && (
        <div style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          zIndex: 1000,
          background: 'rgba(15, 23, 42, 0.95)',
          backdropFilter: 'blur(16px)',
          border: '1px solid var(--emerald-primary)',
          borderRadius: 'var(--radius-md)',
          padding: '16px 20px',
          boxShadow: '0 10px 30px rgba(0,0,0,0.6)',
          display: 'flex',
          alignItems: 'flex-start',
          gap: '12px',
          maxWidth: '380px',
          animation: 'slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
        }}>
          {activeToast.type === 'promo' ? (
            <Sparkles color="#fbbf24" size={24} style={{ flexShrink: 0 }} />
          ) : (
            <Calendar color="var(--emerald-light)" size={24} style={{ flexShrink: 0 }} />
          )}

          <div style={{ flex: 1 }}>
            <h5 style={{ fontSize: '0.95rem', color: '#fff', margin: 0, fontWeight: 700 }}>
              {activeToast.title}
            </h5>
            <p style={{ fontSize: '0.825rem', color: 'var(--text-muted)', margin: '4px 0 0 0' }}>
              {activeToast.message}
            </p>
            <span style={{ fontSize: '0.7rem', color: 'var(--emerald-light)', marginTop: '4px', display: 'inline-block' }}>
              ● Recibido ahora ({activeToast.zone})
            </span>
          </div>

          <button
            onClick={() => setActiveToast(null)}
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 0 }}
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Bell Trigger Button */}
      <button
        className="btn btn-secondary btn-sm"
        onClick={() => setIsOpen(!isOpen)}
        style={{ position: 'relative', padding: '8px 12px' }}
        title="Centro de Notificaciones en Vivo (HU-89 / HU-90)"
      >
        <Bell size={16} />
        <span style={{ display: 'none' }}>Notificaciones</span>
        {unreadCount > 0 && (
          <span style={{
            position: 'absolute',
            top: '-4px',
            right: '-4px',
            background: 'var(--rose-danger)',
            color: '#fff',
            fontSize: '0.7rem',
            fontWeight: 800,
            borderRadius: '999px',
            width: '18px',
            height: '18px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: '2px solid var(--bg-primary)'
          }}>
            {unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown Panel */}
      {isOpen && (
        <div style={{
          position: 'absolute',
          top: '42px',
          right: 0,
          width: '360px',
          maxHeight: '480px',
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border-color)',
          borderRadius: 'var(--radius-md)',
          boxShadow: 'var(--shadow-card)',
          zIndex: 200,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          animation: 'fadeIn 0.2s ease-out'
        }}>
          {/* Header */}
          <div style={{
            padding: '14px 16px',
            borderBottom: '1px solid var(--border-color)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'rgba(0,0,0,0.3)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Bell size={16} color="var(--emerald-light)" />
              <strong style={{ fontSize: '0.95rem', color: '#fff' }}>Notificaciones en Vivo</strong>
            </div>

            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                style={{ background: 'none', border: 'none', color: 'var(--emerald-light)', fontSize: '0.75rem', cursor: 'pointer', fontWeight: 600 }}
              >
                Marcar leídas
              </button>
            )}
          </div>

          {/* List */}
          <div style={{ overflowY: 'auto', flex: 1, padding: '8px' }}>
            {notifications.length === 0 ? (
              <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                No hay notificaciones recientes.
              </div>
            ) : (
              notifications.map(item => (
                <div
                  key={item.id}
                  onClick={() => handleMarkAsRead(item.id)}
                  style={{
                    padding: '12px',
                    borderRadius: 'var(--radius-sm)',
                    background: item.read ? 'transparent' : 'rgba(16, 185, 129, 0.08)',
                    borderBottom: '1px solid var(--border-color)',
                    cursor: 'pointer',
                    display: 'flex',
                    gap: '10px',
                    alignItems: 'flex-start',
                    marginBottom: '4px'
                  }}
                >
                  {item.type === 'promo' ? (
                    <Sparkles size={16} color="#fbbf24" style={{ marginTop: '2px', flexShrink: 0 }} />
                  ) : (
                    <Calendar size={16} color="var(--emerald-light)" style={{ marginTop: '2px', flexShrink: 0 }} />
                  )}

                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                      <span style={{ fontSize: '0.85rem', fontWeight: item.read ? 600 : 800, color: '#fff' }}>
                        {item.title}
                      </span>
                      {!item.read && <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--emerald-primary)' }} />}
                    </div>

                    <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0, lineHeight: 1.3 }}>
                      {item.message}
                    </p>

                    <div style={{ fontSize: '0.7rem', color: 'var(--text-dim)', marginTop: '4px', display: 'flex', justifyContent: 'space-between' }}>
                      <span>{item.placeName || item.zone}</span>
                      <span>{new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border-color)', textAlign: 'center', fontSize: '0.75rem', color: 'var(--text-muted)', background: 'rgba(0,0,0,0.2)' }}>
            HU-89 (Promos) & HU-90 (Eventos) — Event Log en Tiempo Real
          </div>
        </div>
      )}
    </div>
  );
};
