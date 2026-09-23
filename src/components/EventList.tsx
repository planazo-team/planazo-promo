import React, { useState, useEffect } from 'react';
import { PlanazoEvent, Establishment, EventCategory } from '../types';
import { storeService } from '../services/store';
import { Calendar, Clock, Users, DollarSign, Filter, Sparkles, AlertCircle, Info } from 'lucide-react';

interface EventListProps {
  establishment?: Establishment;
  isEstablishmentView?: boolean;
  onOpenCreateEvent?: () => void;
}

export const EventList: React.FC<EventListProps> = ({
  establishment,
  isEstablishmentView = false,
  onOpenCreateEvent
}) => {
  const [events, setEvents] = useState<PlanazoEvent[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('Todas');
  const [selectedDateFilter, setSelectedDateFilter] = useState<string>('todos');

  const categories: string[] = [
    'Todas',
    'Música en Vivo',
    'Gastronomía & Catas',
    'Fiesta / Noche',
    'Cultural / Arte',
    'Especial'
  ];

  const loadEvents = () => {
    let targetDate: string | undefined = undefined;
    const today = new Date().toISOString().split('T')[0];

    if (selectedDateFilter === 'hoy') {
      targetDate = today;
    }

    const fetched = storeService.getEvents(
      establishment?.id,
      selectedCategory,
      targetDate
    );
    setEvents(fetched);
  };

  useEffect(() => {
    loadEvents();
    const unsubscribe = storeService.subscribe(loadEvents);
    return () => unsubscribe();
  }, [establishment?.id, selectedCategory, selectedDateFilter]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Header Controls & Filters (HU-16 CA2) */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px',
        background: 'rgba(17, 24, 39, 0.5)',
        padding: '16px 20px',
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--border-color)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <Calendar color="var(--emerald-light)" size={20} />
          <div>
            <h3 style={{ fontSize: '1.1rem', margin: 0, color: '#fff' }}>
              Eventos Disponibles (HU-16)
            </h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>
              {establishment ? `Eventos organizados por ${establishment.name}` : 'Todos los eventos en Bogotá'}
            </p>
          </div>
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          {/* Category Dropdown */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Filter size={14} color="var(--text-muted)" />
            <select
              className="form-control"
              value={selectedCategory}
              onChange={e => setSelectedCategory(e.target.value)}
              style={{ padding: '6px 12px', fontSize: '0.825rem', width: 'auto' }}
            >
              {categories.map(cat => (
                <option key={cat} value={cat}>Cat: {cat}</option>
              ))}
            </select>
          </div>

          {/* Date Selector */}
          <select
            className="form-control"
            value={selectedDateFilter}
            onChange={e => setSelectedDateFilter(e.target.value)}
            style={{ padding: '6px 12px', fontSize: '0.825rem', width: 'auto' }}
          >
            <option value="todos">Cualquier Fecha</option>
            <option value="hoy">Eventos de Hoy</option>
          </select>

          {/* Action button if in establishment mode */}
          {isEstablishmentView && onOpenCreateEvent && (
            <button className="btn btn-primary btn-sm" onClick={onOpenCreateEvent}>
              + Publicar Evento
            </button>
          )}
        </div>
      </div>

      {/* Events Grid / List */}
      {events.length === 0 ? (
        /* HU-16 CA3: Empty State Info */
        <div className="empty-state">
          <Info size={40} style={{ margin: '0 auto 12px auto', color: 'var(--cyan-accent)' }} />
          <h4 style={{ fontSize: '1.1rem', color: '#fff', marginBottom: '6px' }}>
            No hay eventos disponibles
          </h4>
          <p style={{ fontSize: '0.875rem', maxWidth: '420px', margin: '0 auto 16px auto' }}>
            {selectedCategory !== 'Todas' || selectedDateFilter !== 'todos'
              ? 'No se encontraron eventos que coincidan con los filtros seleccionados. Intenta cambiar la categoría o la fecha.'
              : establishment
              ? `${establishment.name} aún no ha publicado eventos en la plataforma.`
              : 'No hay eventos registrados en este momento.'}
          </p>
          {isEstablishmentView && onOpenCreateEvent && (
            <button className="btn btn-primary btn-sm" onClick={onOpenCreateEvent}>
              + Publicar el primer evento
            </button>
          )}
        </div>
      ) : (
        /* HU-16 CA1: Render filtered results */
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '20px' }}>
          {events.map(evt => {
            const isFull = evt.bookedCapacity >= evt.maxCapacity;
            const availableSeats = evt.maxCapacity - evt.bookedCapacity;

            return (
              <div key={evt.id} className="glass-card" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                {/* Image Banner */}
                <div style={{
                  height: '140px',
                  position: 'relative',
                  backgroundColor: 'rgba(255,255,255,0.05)',
                  backgroundImage: `url(${evt.imageUrl || 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=800&q=80'})`,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center'
                }}>
                  <div style={{
                    position: 'absolute',
                    top: '12px',
                    left: '12px',
                    display: 'flex',
                    gap: '6px'
                  }}>
                    <span className="badge badge-emerald">{evt.category}</span>
                    {evt.status === 'En Vivo' && (
                      <span className="badge badge-rose" style={{ animation: 'pulse 1.5s infinite' }}>● EN VIVO</span>
                    )}
                  </div>

                  <div style={{
                    position: 'absolute',
                    bottom: '12px',
                    right: '12px',
                    background: 'rgba(0,0,0,0.75)',
                    backdropFilter: 'blur(8px)',
                    padding: '4px 10px',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '0.85rem',
                    fontWeight: 700,
                    color: evt.price === 0 ? 'var(--emerald-light)' : '#ffffff'
                  }}>
                    {evt.price === 0 ? 'GRATIS' : `$ ${evt.price.toLocaleString()} COP`}
                  </div>
                </div>

                {/* Content */}
                <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', flex: 1, gap: '10px' }}>
                  <h4 style={{ fontSize: '1.1rem', color: '#fff', margin: 0, lineHeight: 1.3 }}>
                    {evt.title}
                  </h4>

                  <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: 0, lineClamp: 2, WebkitLineClamp: 2, display: '-webkit-box', WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                    {evt.description}
                  </p>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '0.8rem', color: 'var(--text-main)', marginTop: 'auto', paddingTop: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Calendar size={14} color="var(--emerald-light)" />
                      <span>{evt.date}</span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Clock size={14} color="var(--cyan-accent)" />
                      <span>{evt.startTime} - {evt.endTime}</span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', gridColumn: 'span 2' }}>
                      <Users size={14} color="#fbbf24" />
                      <span>
                        Cupos: <strong>{evt.bookedCapacity} / {evt.maxCapacity}</strong> ({isFull ? 'Agotado' : `${availableSeats} disponibles`})
                      </span>
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div style={{ width: '100%', background: 'rgba(255,255,255,0.1)', height: '6px', borderRadius: '3px', overflow: 'hidden' }}>
                    <div style={{
                      width: `${Math.min(100, (evt.bookedCapacity / evt.maxCapacity) * 100)}%`,
                      height: '100%',
                      background: isFull ? 'var(--rose-danger)' : 'linear-gradient(90deg, var(--emerald-primary), var(--cyan-accent))',
                      transition: 'width 0.3s ease'
                    }} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
