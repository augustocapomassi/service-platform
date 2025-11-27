'use client';

import { useState } from 'react';

interface ProposalActionsModalProps {
  proposalId: string;
  jobTitle: string;
  currentAmount: string; // in wei
  proposedAmount: string | null; // in wei
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function ProposalActionsModal({
  proposalId,
  jobTitle,
  currentAmount,
  proposedAmount,
  isOpen,
  onClose,
  onSuccess,
}: ProposalActionsModalProps) {
  const [action, setAction] = useState<'accept' | 'counteroffer' | null>(null);
  const [counterOffer, setCounterOffer] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const formatAmount = (amount: string) => {
    try {
      const wei = BigInt(amount);
      const eth = Number(wei) / 1e18;
      return `${eth.toFixed(4)} ETH`;
    } catch {
      return amount;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!action) {
      setError('Por favor selecciona una acción');
      return;
    }

    if (action === 'counteroffer' && !counterOffer) {
      setError('Por favor ingresa un monto para la contraoferta');
      return;
    }

    setSubmitting(true);

    try {
      const res = await fetch(`/api/proposals/${proposalId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          counterOffer: action === 'counteroffer' ? counterOffer : undefined,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Error al procesar la acción');
      }

      alert(
        action === 'accept'
          ? 'Trabajo aceptado exitosamente!'
          : 'Contraoferta enviada exitosamente!'
      );

      onSuccess();
      onClose();
      
      // Reset form
      setAction(null);
      setCounterOffer('');
    } catch (err: any) {
      console.error('Error processing action:', err);
      setError(err.message || 'Error al procesar la acción');
    } finally {
      setSubmitting(false);
    }
  };

  const displayAmount = proposedAmount || currentAmount;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold">Gestionar Postulación</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-2xl"
            disabled={submitting}
          >
            ×
          </button>
        </div>

        <div className="mb-4">
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Trabajo:</p>
          <p className="font-semibold">{jobTitle}</p>
        </div>

        <div className="mb-4">
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">Monto propuesto:</p>
          <p className="font-semibold text-blue-600 dark:text-blue-400">
            {formatAmount(displayAmount)}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-4 py-3 rounded">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
              ¿Qué deseas hacer?
            </label>
            <div className="space-y-2">
              <label className="flex items-center p-3 border rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700">
                <input
                  type="radio"
                  name="action"
                  value="accept"
                  checked={action === 'accept'}
                  onChange={() => setAction('accept')}
                  className="mr-3"
                  disabled={submitting}
                />
                <div>
                  <p className="font-medium">Aceptar Propuesta</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Aceptar al proveedor directamente y comenzar el trabajo
                  </p>
                </div>
              </label>

              <label className="flex items-center p-3 border rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700">
                <input
                  type="radio"
                  name="action"
                  value="counteroffer"
                  checked={action === 'counteroffer'}
                  onChange={() => setAction('counteroffer')}
                  className="mr-3"
                  disabled={submitting}
                />
                <div>
                  <p className="font-medium">Hacer Contraoferta</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    Proponer un monto diferente
                  </p>
                </div>
              </label>
            </div>
          </div>

          {action === 'counteroffer' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Monto de Contraoferta (ETH)
              </label>
              <input
                type="number"
                step="0.0001"
                min="0"
                value={counterOffer}
                onChange={(e) => setCounterOffer(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                placeholder="Ej: 0.1"
                required
                disabled={submitting}
              />
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Propuesta actual: {formatAmount(displayAmount)}
              </p>
            </div>
          )}

          <div className="flex gap-3 pt-4">
            <button
              type="submit"
              disabled={submitting || !action}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting
                ? 'Procesando...'
                : action === 'accept'
                ? 'Aceptar'
                : 'Enviar Contraoferta'}
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50"
            >
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

