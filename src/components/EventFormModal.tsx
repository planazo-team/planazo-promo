import React, { useState } from 'react';
import { Establishment, EventCategory } from '../types';
import { storeService } from '../services/store';
import { Calendar, Clock, Users, DollarSign, Image, Tag, X, CheckCircle2, AlertCircle } from 'lucide-react';

interface EventFormModalProps {
  establishment: Establishment;
  onClose: () => void;
  onSuccess: () => void;
}

export const EventFormModal: React.FC<EventFormModalProps> = ({
  establishment,
  onClose,
  onSuccess
}) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<EventCategory>('Música en Vivo');
  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('20:00');
  const [endTime, setEndTime] = useState('00:00');
  const [maxCapacity, setMaxCapacity] = useState<number | ''>(50);
  const [price, setPrice] = useState<number | ''>(0);
  const [imageUrl, setImageUrl] = useState('');

  // Validation state
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const categories: EventCategory[] = [
    'Música en Vivo',
    'Gastronomía & Catas',
    'Fiesta / Noche',
    'Cultural / Arte',
    'Especial'
  ];

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!title.trim()) {
      newErrors.title = 'El título del evento es un campo obligatorio.';
    } else if (title.trim().length < 5) {
      newErrors.title = 'El título debe tener al menos 5 caracteres.';
    }

    if (!description.trim()) {
      newErrors.description = 'La descripción del evento es obligatoria.';
    }

    if (!date) {
      newErrors.date = 'Debe seleccionar una fecha para el evento.';
    }

    if (!startTime) {
      newErrors.startTime = 'La hora de inicio es obligatoria.';
    }

    if (!endTime) {
      newErrors.endTime = 'La hora de finalización es obligatoria.';
    }

    if (maxCapacity === '' || Number(maxCapacity) <= 0) {
      newErrors.maxCapacity = 'El cupo máximo debe ser un número entero mayor a 0.';
    }

    if (price === '' || Number(price) < 0) {
      newErrors.price = 'El precio debe ser igual o mayor a $0.';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setServerError(null);

    if (!validateForm()) {
      return;
    }

    // Call Store Service to persist (HU-23)
    const result = storeService.addEvent({
      establishmentId: establishment.id,
      title: title.trim(),
      description: description.trim(),
      category,
      date,
      startTime,
      endTime,
      maxCapacity: Number(maxCapacity),
      price: Number(price),
      imageUrl: imageUrl.trim() || undefined
    });

    if (result.success) {
      setSuccessMessage(`¡Evento "${title}" publicado exitosamente para ${establishment.name}!`);
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 1200);
    } else {
      setServerError(result.error || 'Error al publicar el evento.');
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="modal-header">
          <div>
            <h3 style={{ fontSize: '1.25rem', color: '#fff', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Calendar color="var(--emerald-light)" size={20} /> Publicar Nuevo Evento (HU-23)
            </h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>
              Establecimiento autorizador: <strong style={{ color: 'var(--emerald-light)' }}>{establishment.name}</strong>
            </p>
          </div>
          <button 
            onClick={onClose} 
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Success Message Banner */}
        {successMessage ? (
          <div className="modal-body" style={{ textAlign: 'center', padding: '40px 24px' }}>
            <CheckCircle2 size={48} color="var(--emerald-light)" style={{ marginBottom: '16px' }} />
            <h4 style={{ fontSize: '1.2rem', color: '#fff', marginBottom: '8px' }}>Confirmación Recibida</h4>
            <p style={{ color: 'var(--text-muted)' }}>{successMessage}</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="modal-body">
              {serverError && (
                <div style={{
                  padding: '12px',
                  background: 'rgba(244, 63, 94, 0.15)',
                  border: '1px solid var(--rose-danger)',
                  borderRadius: 'var(--radius-sm)',
                  color: '#fda4af',
                  fontSize: '0.875rem',
                  marginBottom: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  <AlertCircle size={16} />
                  <span>{serverError}</span>
                </div>
              )}

              {/* Title */}
              <div className="form-group">
                <label className="form-label">
                  Título del Evento <span className="required">*</span>
                </label>
                <input
                  type="text"
                  className={`form-control ${errors.title ? 'error' : ''}`}
                  placeholder="ej. Noche de Jazz & Catas Seleccionadas"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                />
                {errors.title && <span className="error-text">{errors.title}</span>}
              </div>

              {/* Category */}
              <div className="form-group">
                <label className="form-label">
                  Categoría del Evento <span className="required">*</span>
                </label>
                <select
                  className="form-control"
                  value={category}
                  onChange={e => setCategory(e.target.value as EventCategory)}
                >
                  {categories.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>

              {/* Description */}
              <div className="form-group">
                <label className="form-label">
                  Descripción Detallada <span className="required">*</span>
                </label>
                <textarea
                  className={`form-control ${errors.description ? 'error' : ''}`}
                  rows={3}
                  placeholder="Describe la experiencia, vestimenta, artistas invitados o beneficios..."
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                />
                {errors.description && <span className="error-text">{errors.description}</span>}
              </div>

              {/* Date & Hours Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                <div className="form-group">
                  <label className="form-label">
                    <Calendar size={12} /> Fecha <span className="required">*</span>
                  </label>
                  <input
                    type="date"
                    className={`form-control ${errors.date ? 'error' : ''}`}
                    value={date}
                    onChange={e => setDate(e.target.value)}
                    min={new Date().toISOString().split('T')[0]}
                  />
                  {errors.date && <span className="error-text">{errors.date}</span>}
                </div>

                <div className="form-group">
                  <label className="form-label">
                    <Clock size={12} /> Hora Inicio <span className="required">*</span>
                  </label>
                  <input
                    type="time"
                    className={`form-control ${errors.startTime ? 'error' : ''}`}
                    value={startTime}
                    onChange={e => setStartTime(e.target.value)}
                  />
                  {errors.startTime && <span className="error-text">{errors.startTime}</span>}
                </div>

                <div className="form-group">
                  <label className="form-label">
                    <Clock size={12} /> Hora Fin <span className="required">*</span>
                  </label>
                  <input
                    type="time"
                    className={`form-control ${errors.endTime ? 'error' : ''}`}
                    value={endTime}
                    onChange={e => setEndTime(e.target.value)}
                  />
                  {errors.endTime && <span className="error-text">{errors.endTime}</span>}
                </div>
              </div>

              {/* Capacity & Price Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="form-group">
                  <label className="form-label">
                    <Users size={12} /> Cupo Máximo <span className="required">*</span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    className={`form-control ${errors.maxCapacity ? 'error' : ''}`}
                    placeholder="ej. 50"
                    value={maxCapacity}
                    onChange={e => setMaxCapacity(e.target.value === '' ? '' : Number(e.target.value))}
                  />
                  {errors.maxCapacity && <span className="error-text">{errors.maxCapacity}</span>}
                </div>

                <div className="form-group">
                  <label className="form-label">
                    <DollarSign size={12} /> Precio de Entradas ($ COP) <span className="required">*</span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1000"
                    className={`form-control ${errors.price ? 'error' : ''}`}
                    placeholder="0 para Entrada Libre"
                    value={price}
                    onChange={e => setPrice(e.target.value === '' ? '' : Number(e.target.value))}
                  />
                  {errors.price && <span className="error-text">{errors.price}</span>}
                </div>
              </div>

              {/* Image URL Optional */}
              <div className="form-group">
                <label className="form-label">
                  <Image size={12} /> URL Imagen promocional (Opcional)
                </label>
                <input
                  type="url"
                  className="form-control"
                  placeholder="https://..."
                  value={imageUrl}
                  onChange={e => setImageUrl(e.target.value)}
                />
              </div>
            </div>

            {/* Footer Actions */}
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={onClose}>
                Cancelar
              </button>
              <button type="submit" className="btn btn-primary">
                <Tag size={16} /> Publicar Evento
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
