import React, { useState } from 'react';
import { Establishment, Zone, Promotion } from '../types';
import { storeService } from '../services/store';
import { Sparkles, Clock, Flame, Ticket, X, CheckCircle2, AlertCircle } from 'lucide-react';

interface PromoFormModalProps {
  establishment: Establishment;
  editingPromo?: Promotion | null;
  onClose: () => void;
  onSuccess: () => void;
}

export const PromoFormModal: React.FC<PromoFormModalProps> = ({
  establishment,
  editingPromo,
  onClose,
  onSuccess
}) => {
  const [title, setTitle] = useState(editingPromo ? editingPromo.title : '');
  const [description, setDescription] = useState(editingPromo ? editingPromo.description : '');
  const [discountPercentage, setDiscountPercentage] = useState<number | ''>(editingPromo?.discountPercentage ?? 30);
  const [discountCode, setDiscountCode] = useState(editingPromo ? editingPromo.discountCode : `${establishment.name.substring(0, 4).toUpperCase()}${Math.floor(10 + Math.random() * 90)}`);
  const [initialStock, setInitialStock] = useState<number | ''>(editingPromo ? editingPromo.initialStock : 10);
  const [durationHours, setDurationHours] = useState<number>(3);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!title.trim()) {
      newErrors.title = 'El título de la promoción es un campo obligatorio.';
    }

    if (!description.trim()) {
      newErrors.description = 'La descripción de los beneficios es obligatoria.';
    }

    if (!discountCode.trim()) {
      newErrors.discountCode = 'El código de descuento es obligatorio para los cupones.';
    }

    if (initialStock === '' || Number(initialStock) <= 0) {
      newErrors.initialStock = 'El stock/cupos disponibles debe ser un número entero mayor a 0.';
    }

    if (discountPercentage !== '' && (Number(discountPercentage) < 0 || Number(discountPercentage) > 100)) {
      newErrors.discountPercentage = 'El porcentaje debe estar entre 0% y 100%.';
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

    if (editingPromo) {
      // HU-69 Update existing promo
      const result = storeService.updatePromotion(editingPromo.id, {
        title: title.trim(),
        description: description.trim(),
        discountPercentage: discountPercentage === '' ? undefined : Number(discountPercentage),
        discountCode: discountCode.trim().toUpperCase(),
        initialStock: Number(initialStock),
        currentStock: Number(initialStock) // Reset current stock if initial stock changed
      });

      if (result.success) {
        setSuccessMessage(`¡Promoción "${title}" actualizada correctamente!`);
        setTimeout(() => {
          onSuccess();
          onClose();
        }, 1200);
      } else {
        setServerError(result.error || 'Error al actualizar la promoción.');
      }
    } else {
      // HU-26 Create new promo
      const expiresAt = new Date(Date.now() + durationHours * 3600 * 1000).toISOString();

      const result = storeService.addPromotion({
        establishmentId: establishment.id,
        title: title.trim(),
        description: description.trim(),
        discountPercentage: discountPercentage === '' ? undefined : Number(discountPercentage),
        discountCode: discountCode.trim().toUpperCase(),
        initialStock: Number(initialStock),
        expiresAt,
        zone: establishment.zone as Zone
      });

      if (result.success) {
        setSuccessMessage(`¡Promoción "${title}" lanzada exitosamente a usuarios cercanos en ${establishment.zone}!`);
        setTimeout(() => {
          onSuccess();
          onClose();
        }, 1200);
      } else {
        setServerError(result.error || 'Error al publicar la promoción.');
      }
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h3 style={{ fontSize: '1.25rem', color: '#fff', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Sparkles color="#fbbf24" size={20} /> {editingPromo ? 'Editar Promoción (HU-69)' : 'Lanzar Promoción Relámpago (HU-26 / HU-69)'}
            </h3>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: 0 }}>
              Emisor autorizado: <strong style={{ color: '#fbbf24' }}>{establishment.name}</strong> ({establishment.zone})
            </p>
          </div>
          <button 
            onClick={onClose} 
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
          >
            <X size={20} />
          </button>
        </div>

        {successMessage ? (
          <div className="modal-body" style={{ textAlign: 'center', padding: '40px 24px' }}>
            <CheckCircle2 size={48} color="#fbbf24" style={{ marginBottom: '16px' }} />
            <h4 style={{ fontSize: '1.2rem', color: '#fff', marginBottom: '8px' }}>Operación Guardada</h4>
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

              <div className="form-group">
                <label className="form-label">
                  Título de la Oferta / Promoción <span className="required">*</span>
                </label>
                <input
                  type="text"
                  className={`form-control ${errors.title ? 'error' : ''}`}
                  placeholder="ej. 2x1 en Bebidas de Autor de 6 a 9 PM"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                />
                {errors.title && <span className="error-text">{errors.title}</span>}
              </div>

              <div className="form-group">
                <label className="form-label">
                  Detalles y Condiciones <span className="required">*</span>
                </label>
                <textarea
                  className={`form-control ${errors.description ? 'error' : ''}`}
                  rows={2}
                  placeholder="Aplica mostrando este cupón al llegar al establecimiento..."
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                />
                {errors.description && <span className="error-text">{errors.description}</span>}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="form-group">
                  <label className="form-label">
                    % Descuento Destacado
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    className={`form-control ${errors.discountPercentage ? 'error' : ''}`}
                    placeholder="ej. 50"
                    value={discountPercentage}
                    onChange={e => setDiscountPercentage(e.target.value === '' ? '' : Number(e.target.value))}
                  />
                  {errors.discountPercentage && <span className="error-text">{errors.discountPercentage}</span>}
                </div>

                <div className="form-group">
                  <label className="form-label">
                    <Ticket size={12} /> Código de Cupón <span className="required">*</span>
                  </label>
                  <input
                    type="text"
                    className={`form-control ${errors.discountCode ? 'error' : ''}`}
                    placeholder="ej. GATO2X1"
                    value={discountCode}
                    onChange={e => setDiscountCode(e.target.value.toUpperCase())}
                  />
                  {errors.discountCode && <span className="error-text">{errors.discountCode}</span>}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="form-group">
                  <label className="form-label">
                    <Flame size={12} /> Stock / Cupos Limitados <span className="required">*</span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    className={`form-control ${errors.initialStock ? 'error' : ''}`}
                    placeholder="ej. 15"
                    value={initialStock}
                    onChange={e => setInitialStock(e.target.value === '' ? '' : Number(e.target.value))}
                  />
                  {errors.initialStock && <span className="error-text">{errors.initialStock}</span>}
                </div>

                {!editingPromo && (
                  <div className="form-group">
                    <label className="form-label">
                      <Clock size={12} /> Duración de la Oferta <span className="required">*</span>
                    </label>
                    <select
                      className="form-control"
                      value={durationHours}
                      onChange={e => setDurationHours(Number(e.target.value))}
                    >
                      <option value={1}>1 hora (Relámpago)</option>
                      <option value={2}>2 horas</option>
                      <option value={3}>3 horas</option>
                      <option value={6}>6 horas</option>
                      <option value={12}>12 horas</option>
                      <option value={24}>24 horas (Todo el día)</option>
                    </select>
                  </div>
                )}
              </div>
            </div>

            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={onClose}>
                Cancelar
              </button>
              <button type="submit" className="btn btn-primary" style={{ background: 'linear-gradient(135deg, #f59e0b, #d97706)' }}>
                <Sparkles size={16} /> {editingPromo ? 'Guardar Cambios' : 'Publicar Promoción'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
