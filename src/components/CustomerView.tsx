import React, { useState, useEffect } from 'react';
import { Establishment, Zone, Category, FilterOptions } from '../types';
import { storeService } from '../services/store';
import { EventList } from './EventList';
import { PromoList } from './PromoList';
import { MapPin, Search, Filter, Calendar, Sparkles, Star, Clock, ChevronRight, X, Compass, Phone } from 'lucide-react';

interface CustomerViewProps {
  establishments: Establishment[];
}

export const CustomerView: React.FC<CustomerViewProps> = ({ establishments }) => {
  const [activeTab, setActiveTab] = useState<'map' | 'events' | 'promos'>('map');
  const [selectedEstablishment, setSelectedEstablishment] = useState<Establishment | null>(null);

  // Filters
  const [filters, setFilters] = useState<FilterOptions>({
    zone: 'Todas',
    category: 'Todas',
    searchQuery: '',
    onlyWithPromos: false,
    onlyWithEvents: false
  });

  const categories: (Category | 'Todas')[] = [
    'Todas',
    'Restaurantes',
    'Discotecas y Bares',
    'Eventos',
    'Lugares de Interés',
    'Hoteles'
  ];

  const zones: (Zone | 'Todas')[] = ['Todas', 'Zona G', 'Zona T'];

  // Filter establishments
  const filteredEstablishments = establishments.filter(est => {
    if (filters.zone !== 'Todas' && est.zone !== filters.zone) return false;
    if (filters.category !== 'Todas' && est.category !== filters.category) return false;
    if (filters.searchQuery.trim() !== '') {
      const q = filters.searchQuery.toLowerCase();
      const matchName = est.name.toLowerCase().includes(q);
      const matchDesc = est.description.toLowerCase().includes(q);
      const matchAddress = est.address.toLowerCase().includes(q);
      if (!matchName && !matchDesc && !matchAddress) return false;
    }

    if (filters.onlyWithPromos) {
      const promos = storeService.getPromotions(est.id, undefined, true);
      if (promos.length === 0) return false;
    }

    if (filters.onlyWithEvents) {
      const evts = storeService.getEvents(est.id);
      if (evts.length === 0) return false;
    }

    return true;
  });

  return (
    <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '24px 20px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Hero Welcome Banner */}
      <div className="glass-panel" style={{
        padding: '24px 28px',
        background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.12), rgba(6, 182, 212, 0.12))',
        border: '1px solid rgba(16, 185, 129, 0.3)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '16px'
      }}>
        <div>
          <span className="badge badge-emerald" style={{ marginBottom: '8px' }}>● Piloto Vivo — Chapinero</span>
          <h2 style={{ fontSize: '1.8rem', color: '#fff', margin: 0, lineHeight: 1.2 }}>
            Descubre qué hacer hoy en Zona G y Zona T
          </h2>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', margin: '4px 0 0 0' }}>
            Explora establecimientos, consulta su disponibilidad al minuto y aprovecha ofertas exclusivas en tiempo real.
          </p>
        </div>

        {/* Global Stats */}
        <div style={{ display: 'flex', gap: '12px' }}>
          <div style={{ background: 'rgba(0,0,0,0.4)', padding: '10px 16px', borderRadius: 'var(--radius-sm)', textAlign: 'center' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Establecimientos</div>
            <div style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--emerald-light)' }}>{establishments.length}</div>
          </div>
          <div style={{ background: 'rgba(0,0,0,0.4)', padding: '10px 16px', borderRadius: 'var(--radius-sm)', textAlign: 'center' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Zonas Piloto</div>
            <div style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--cyan-accent)' }}>2</div>
          </div>
        </div>
      </div>

      {/* Primary Navigation Tabs */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        borderBottom: '1px solid var(--border-color)',
        paddingBottom: '12px'
      }}>
        <button
          className={`btn ${activeTab === 'map' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveTab('map')}
        >
          <Compass size={18} /> Explorar Establecimientos
        </button>

        <button
          className={`btn ${activeTab === 'events' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveTab('events')}
        >
          <Calendar size={18} /> Consultar Eventos (HU-16)
        </button>

        <button
          className={`btn ${activeTab === 'promos' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setActiveTab('promos')}
          style={activeTab === 'promos' ? { background: 'linear-gradient(135deg, #f59e0b, #d97706)' } : undefined}
        >
          <Sparkles size={18} /> Promociones en Tiempo Real (HU-17)
        </button>
      </div>

      {/* Tab: Establishments / Directory */}
      {activeTab === 'map' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Filter Bar */}
          <div className="glass-panel" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
            {/* Search Input */}
            <div style={{ flex: 1, minWidth: '220px', position: 'relative' }}>
              <Search size={16} color="var(--text-muted)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
              <input
                type="text"
                className="form-control"
                placeholder="Buscar por nombre, dirección o tipo de cocina..."
                value={filters.searchQuery}
                onChange={e => setFilters({ ...filters, searchQuery: e.target.value })}
                style={{ paddingLeft: '36px' }}
              />
            </div>

            {/* Zone filter */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Zona:</span>
              <select
                className="form-control"
                value={filters.zone}
                onChange={e => setFilters({ ...filters, zone: e.target.value as Zone | 'Todas' })}
                style={{ width: 'auto' }}
              >
                {zones.map(z => <option key={z} value={z}>{z}</option>)}
              </select>
            </div>

            {/* Category filter */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Categoría:</span>
              <select
                className="form-control"
                value={filters.category}
                onChange={e => setFilters({ ...filters, category: e.target.value as Category | 'Todas' })}
                style={{ width: 'auto' }}
              >
                {categories.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            {/* Quick check filters */}
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.825rem', cursor: 'pointer', color: 'var(--text-muted)' }}>
              <input
                type="checkbox"
                checked={filters.onlyWithPromos}
                onChange={e => setFilters({ ...filters, onlyWithPromos: e.target.checked })}
                style={{ accentColor: 'var(--emerald-primary)' }}
              />
              Solo con Promociones (HU-17)
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.825rem', cursor: 'pointer', color: 'var(--text-muted)' }}>
              <input
                type="checkbox"
                checked={filters.onlyWithEvents}
                onChange={e => setFilters({ ...filters, onlyWithEvents: e.target.checked })}
                style={{ accentColor: 'var(--emerald-primary)' }}
              />
              Solo con Eventos (HU-16)
            </label>
          </div>

          {/* Establishments Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '20px' }}>
            {filteredEstablishments.map(est => {
              const activeEvents = storeService.getEvents(est.id);
              const activePromos = storeService.getPromotions(est.id, undefined, true);

              return (
                <div
                  key={est.id}
                  className="glass-card"
                  style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', cursor: 'pointer' }}
                  onClick={() => setSelectedEstablishment(est)}
                >
                  <div style={{
                    height: '160px',
                    position: 'relative',
                    backgroundImage: `url(${est.image})`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center'
                  }}>
                    <div style={{ position: 'absolute', top: '12px', left: '12px', display: 'flex', gap: '6px' }}>
                      <span className="badge badge-emerald">{est.category}</span>
                      <span className="badge badge-cyan">{est.zone}</span>
                    </div>

                    <div style={{
                      position: 'absolute',
                      bottom: '12px',
                      right: '12px',
                      background: 'rgba(0,0,0,0.8)',
                      backdropFilter: 'blur(8px)',
                      padding: '4px 10px',
                      borderRadius: 'var(--radius-sm)',
                      fontSize: '0.85rem',
                      fontWeight: 700,
                      color: '#fbbf24',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}>
                      <Star size={14} fill="#fbbf24" color="#fbbf24" /> {est.rating}
                    </div>
                  </div>

                  <div style={{ padding: '18px', display: 'flex', flexDirection: 'column', flex: 1, gap: '10px' }}>
                    <h3 style={{ fontSize: '1.2rem', color: '#fff', margin: 0 }}>
                      {est.name}
                    </h3>

                    <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: 0, lineClamp: 2, WebkitLineClamp: 2, display: '-webkit-box', WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                      {est.description}
                    </p>

                    <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px', marginTop: 'auto' }}>
                      <MapPin size={14} color="var(--emerald-light)" /> {est.address}
                    </div>

                    {/* Active Offer Indicators */}
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      paddingTop: '10px',
                      borderTop: '1px solid var(--border-color)',
                      fontSize: '0.8rem'
                    }}>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        {activeEvents.length > 0 && (
                          <span className="badge badge-emerald" style={{ textTransform: 'none' }}>
                            <Calendar size={12} /> {activeEvents.length} Eventos (HU-16)
                          </span>
                        )}
                        {activePromos.length > 0 && (
                          <span className="badge badge-amber" style={{ textTransform: 'none' }}>
                            <Sparkles size={12} /> {activePromos.length} Promos (HU-17)
                          </span>
                        )}
                      </div>

                      <span style={{ color: 'var(--emerald-light)', fontWeight: 600, display: 'flex', alignItems: 'center' }}>
                        Ver Ficha <ChevronRight size={14} />
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Tab: Events View (HU-16) */}
      {activeTab === 'events' && (
        <EventList />
      )}

      {/* Tab: Promos View (HU-17) */}
      {activeTab === 'promos' && (
        <PromoList />
      )}

      {/* Establishment Detail Modal (Covers HU-16 and HU-17 in Venue Context) */}
      {selectedEstablishment && (
        <div className="modal-overlay" onClick={() => setSelectedEstablishment(null)}>
          <div className="modal-content" style={{ maxWidth: '850px' }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <img
                  src={selectedEstablishment.image}
                  alt={selectedEstablishment.name}
                  style={{ width: '60px', height: '60px', borderRadius: 'var(--radius-sm)', objectFit: 'cover' }}
                />
                <div>
                  <h3 style={{ fontSize: '1.3rem', color: '#fff', margin: 0 }}>
                    {selectedEstablishment.name}
                  </h3>
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <MapPin size={13} color="var(--emerald-light)" /> {selectedEstablishment.address} ({selectedEstablishment.zone})
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedEstablishment(null)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.925rem', margin: 0 }}>
                {selectedEstablishment.description}
              </p>

              {/* Section 1: Promociones Vigentes del Establecimiento (HU-17) */}
              <section>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
                  <Sparkles size={18} color="#fbbf24" />
                  <h4 style={{ fontSize: '1.1rem', color: '#fff', margin: 0 }}>
                    Promociones Vigentes (HU-17)
                  </h4>
                </div>
                <PromoList establishment={selectedEstablishment} />
              </section>

              {/* Section 2: Eventos del Establecimiento (HU-16) */}
              <section>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
                  <Calendar size={18} color="var(--emerald-light)" />
                  <h4 style={{ fontSize: '1.1rem', color: '#fff', margin: 0 }}>
                    Próximos Eventos (HU-16)
                  </h4>
                </div>
                <EventList establishment={selectedEstablishment} />
              </section>
            </div>

            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setSelectedEstablishment(null)}>
                Cerrar Ficha
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
