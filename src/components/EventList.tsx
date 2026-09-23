import React, { useState, useEffect } from 'react';
import { PlanazoEvent, Establishment } from '../types';
import { storeService } from '../services/store';
import { Calendar, Clock, Users, Filter, Info, Edit, Trash2, CheckCircle2 } from 'lucide-react';

interface EventListProps {
  establishment?: Establishment;
  isEstablishmentView?: boolean;
  onOpenCreateEvent?: () => void;
  onEditEvent?: (event: PlanazoEvent) => void;
}

export const EventList: React.FC<EventListProps> = ({
  establishment,
  isEstablishmentView = false,
  onOpenCreateEvent,
  onEditEvent
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

  const handleDeleteEvent = (id: string, title: string) => {
    if (confirm(`¿Estás seguro de que deseas eliminar el evento "${title}"?`)) {
      storeService.deleteEvent(id);
    }
  };

  const handleToggleStatus = (evt: PlanazoEvent) => {
    const nextStatus = evt.status === 'Programado' ? 'En Vivo' : evt.status === 'En Vivo' ? 'Finalizado' : 'Programado';
    storeService.updateEventStatus(evt.id, nextStatus);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Header Controls & Filters (HU-16 / HU-68) */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'Space-between',
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
              {isEstablishmentView ? 'Gestión de Eventos (HU-68)' : 'Eventos Disponibles (HU-16)'}
            </h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>
              {establishment ? `Eventos de ${establishment.name}` : 'Todos los eventos'}
            </p>
          </div>
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
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

          <select
            className="form-control"
            value={selectedDateFilter}
            onChange={e => setSelectedDateFilter(e.target.value)}
            style={{ padding: '6px 12px', fontSize: '0.825rem', width: 'auto' }}
          >
            <option value="todos">Cualquier Fecha</option>
            <option value="hoy">Eventos de Hoy</option>
          </select>

          {isEstablishmentView && onOpenCreateEvent && (
            <button className="btn btn-primary btn-sm" onClick={onOpenCreateEvent}>
              + Publicar Evento
            </button>
          )}
        </div>
      </div>

      {/* Events Grid */}
      {events.length === 0 ? (
        <div className="empty-state">
          <Info size={40} style={{ margin: '0 auto 12px auto', color: 'var(--cyan-accent)' }} />
          <h4 style={{ fontSize: '1.1rem', color: '#fff', marginBottom: '6px' }}>
            No hay eventos registrados
          </h4>
          <p style={{ fontSize: '0.875rem', maxWidth: '420px', margin: '0 auto 16px auto' }}>
            {establishment
              ? `${establishment.name} no cuenta con eventos en la categoría seleccionada.`
              : 'No hay eventos disponibles actualmente.'}
          </p>
          {isEstablishmentView && onOpenCreateEvent && (
            <button className="btn btn-primary btn-sm" onClick={onOpenCreateEvent}>
              + Publicar el primer evento
            </button>
          )}
        </div>
      ) : (
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
                    <span
                      className={`badge ${evt.status === 'En Vivo' ? 'badge-rose' : evt.status === 'Programado' ? 'badge-cyan' : 'badge-amber'}`}
                      style={{ cursor: isEstablishmentView ? 'pointer' : 'default' }}
                      onClick={() => isEstablishmentView && handleToggleStatus(evt)}
                      title={isEstablishmentView ? 'Haz clic para cambiar estado' : undefined}
                    >
                      ● {evt.status.toUpperCase()}
                    </span>
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

                  {/* Management Action Bar (HU-68) */}
                  {isEstablishmentView && (
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      paddingTop: '10px',
                      borderTop: '1px solid var(--border-color)',
                      marginTop: '6px'
                    }}>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => handleToggleStatus(evt)}
                        title="Cambiar estado del evento"
                      >
                        Estado: {evt.status}
                      </button>

                      <div style={{ display: 'flex', gap: '6px' }}>
                        {onEditEvent && (
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => onEditEvent(evt)}
                            title="Editar evento (HU-68)"
                          >
                            <Edit size={14} /> Editar
                          </button>
                        )}

                        <button
                          className="btn btn-danger btn-sm"
                          onClick={() => handleDeleteEvent(evt.id, evt.title)}
                          title="Eliminar evento (HU-68)"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
