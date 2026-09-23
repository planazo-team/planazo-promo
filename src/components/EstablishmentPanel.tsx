import React, { useState, useEffect } from 'react';
import { Establishment, PlanazoEvent, Promotion } from '../types';
import { storeService } from '../services/store';
import { EventList } from './EventList';
import { PromoList } from './PromoList';
import { EventFormModal } from './EventFormModal';
import { PromoFormModal } from './PromoFormModal';
import { Calendar, Sparkles, Plus, MapPin, ShieldCheck } from 'lucide-react';

interface EstablishmentPanelProps {
  establishment: Establishment;
}

export const EstablishmentPanel: React.FC<EstablishmentPanelProps> = ({ establishment }) => {
  const [activeTab, setActiveTab] = useState<'events' | 'promos'>('events');
  const [showEventModal, setShowEventModal] = useState<boolean>(false);
  const [showPromoModal, setShowPromoModal] = useState<boolean>(false);

  const [editingEvent, setEditingEvent] = useState<PlanazoEvent | null>(null);
  const [editingPromo, setEditingPromo] = useState<Promotion | null>(null);

  const [eventsCount, setEventsCount] = useState<number>(0);
  const [promosCount, setPromosCount] = useState<number>(0);

  const updateCounts = () => {
    const evts = storeService.getEvents(establishment.id);
    const prms = storeService.getPromotions(establishment.id, undefined, false);
    setEventsCount(evts.length);
    setPromosCount(prms.length);
  };

  useEffect(() => {
    updateCounts();
    const unsubscribe = storeService.subscribe(updateCounts);
    return () => unsubscribe();
  }, [establishment.id]);

  const handleStartEditEvent = (evt: PlanazoEvent) => {
    setEditingEvent(evt);
    setShowEventModal(true);
  };

  const handleStartEditPromo = (promo: Promotion) => {
    setEditingPromo(promo);
    setShowPromoModal(true);
  };

  return (
    <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '24px 20px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Venue Header Banner */}
      <div className="glass-panel" style={{
        padding: '24px 28px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '20px',
        position: 'relative',
        overflow: 'hidden'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <img
            src={establishment.image}
            alt={establishment.name}
            style={{
              width: '90px',
              height: '90px',
              borderRadius: 'var(--radius-md)',
              objectFit: 'cover',
              border: '2px solid var(--border-color)'
            }}
          />
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <span className="badge badge-emerald">{establishment.category}</span>
              <span className="badge badge-cyan">{establishment.zone}</span>
              <span style={{ fontSize: '0.75rem', color: 'var(--emerald-light)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <ShieldCheck size={14} /> Actor Autorizado
              </span>
            </div>
            <h2 style={{ fontSize: '1.75rem', color: '#fff', margin: 0, lineHeight: 1.2 }}>
              {establishment.name}
            </h2>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', margin: '4px 0 0 0', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <MapPin size={14} color="var(--emerald-light)" /> {establishment.address} • Tel: {establishment.phone}
            </p>
          </div>
        </div>

        {/* Quick Stats Grid */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{
            background: 'rgba(17, 24, 39, 0.6)',
            border: '1px solid var(--border-color)',
            padding: '12px 18px',
            borderRadius: 'var(--radius-md)',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Ocupación Vivo</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--emerald-light)' }}>
              {establishment.occupied} / {establishment.capacity}
            </div>
          </div>

          <div style={{
            background: 'rgba(17, 24, 39, 0.6)',
            border: '1px solid var(--border-color)',
            padding: '12px 18px',
            borderRadius: 'var(--radius-md)',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Eventos Activos</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#ffffff' }}>
              {eventsCount}
            </div>
          </div>

          <div style={{
            background: 'rgba(17, 24, 39, 0.6)',
            border: '1px solid var(--border-color)',
            padding: '12px 18px',
            borderRadius: 'var(--radius-md)',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Promos Totales</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#fbbf24' }}>
              {promosCount}
            </div>
          </div>
        </div>
      </div>

      {/* Main Tabs Navigation */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottom: '1px solid var(--border-color)',
        paddingBottom: '12px'
      }}>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            className={`btn ${activeTab === 'events' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveTab('events')}
          >
            <Calendar size={18} /> Publicación & Gestión de Eventos (HU-68) ({eventsCount})
          </button>
          <button
            className={`btn ${activeTab === 'promos' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setActiveTab('promos')}
            style={activeTab === 'promos' ? { background: 'linear-gradient(135deg, #f59e0b, #d97706)' } : undefined}
          >
            <Sparkles size={18} /> Publicación & Gestión de Promociones (HU-69) ({promosCount})
          </button>
        </div>

        {/* Action button based on active tab */}
        {activeTab === 'events' ? (
          <button className="btn btn-primary" onClick={() => { setEditingEvent(null); setShowEventModal(true); }}>
            <Plus size={18} /> Publicar Evento (HU-68)
          </button>
        ) : (
          <button className="btn btn-primary" style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)' }} onClick={() => { setEditingPromo(null); setShowPromoModal(true); }}>
            <Plus size={18} /> Lanzar Promoción (HU-69)
          </button>
        )}
      </div>

      {/* Tab Content */}
      {activeTab === 'events' ? (
        <EventList
          establishment={establishment}
          isEstablishmentView={true}
          onOpenCreateEvent={() => { setEditingEvent(null); setShowEventModal(true); }}
          onEditEvent={handleStartEditEvent}
        />
      ) : (
        <PromoList
          establishment={establishment}
          isEstablishmentView={true}
          onOpenCreatePromo={() => { setEditingPromo(null); setShowPromoModal(true); }}
          onEditPromo={handleStartEditPromo}
        />
      )}

      {/* HU-23 / HU-68 Event Modal */}
      {showEventModal && (
        <EventFormModal
          establishment={establishment}
          editingEvent={editingEvent}
          onClose={() => { setShowEventModal(false); setEditingEvent(null); }}
          onSuccess={() => {
            updateCounts();
          }}
        />
      )}

      {/* HU-26 / HU-69 Promo Modal */}
      {showPromoModal && (
        <PromoFormModal
          establishment={establishment}
          editingPromo={editingPromo}
          onClose={() => { setShowPromoModal(false); setEditingPromo(null); }}
          onSuccess={() => {
            updateCounts();
          }}
        />
      )}
    </div>
  );
};
