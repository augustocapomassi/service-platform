'use client';

import { useState, useEffect } from 'react';
import { Specialty } from '@prisma/client';

interface UserProfileProps {
  userId: string;
}

interface UserData {
  id: string;
  email: string;
  walletAddress: string;
  specialties: Specialty[];
  clientScore: number;
  providerScore: number;
}

const SPECIALTY_LABELS: Record<Specialty, string> = {
  PLOMERIA: 'Plomería',
  ELECTRICIDAD: 'Electricidad',
  ALBANILERIA: 'Albañilería',
  MANTENIMIENTO: 'Mantenimiento',
  LIMPIEZA: 'Limpieza',
  OTROS: 'Otros',
};

export default function UserProfile({ userId }: UserProfileProps) {
  const [user, setUser] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [selectedSpecialties, setSelectedSpecialties] = useState<Specialty[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchUser();
  }, [userId]);

  const fetchUser = async () => {
    try {
      const res = await fetch(`/api/users/${userId}`);
      if (res.ok) {
        const data = await res.json();
        setUser(data);
        setSelectedSpecialties(data.specialties || []);
      }
    } catch (error) {
      console.error('Error fetching user:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSpecialtyToggle = (specialty: Specialty) => {
    setSelectedSpecialties((prev) =>
      prev.includes(specialty)
        ? prev.filter((s) => s !== specialty)
        : [...prev, specialty]
    );
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ specialties: selectedSpecialties }),
      });

      if (res.ok) {
        const updated = await res.json();
        setUser(updated);
        setEditing(false);
        alert('Especialidades actualizadas correctamente');
      } else {
        alert('Error al actualizar especialidades');
      }
    } catch (error) {
      console.error('Error saving specialties:', error);
      alert('Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="p-8">Cargando perfil...</div>;
  }

  if (!user) {
    return <div className="p-8">Usuario no encontrado</div>;
  }

  const isProvider = user.specialties.length > 0;
  const allSpecialties = Object.values(Specialty);

  return (
    <div className="max-w-4xl mx-auto p-8">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 mb-6">
        <h1 className="text-3xl font-bold mb-6">Mi Perfil</h1>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Email
            </label>
            <p className="text-gray-900 dark:text-gray-100">{user.email}</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Wallet Address
            </label>
            <p className="text-sm text-gray-600 dark:text-gray-400 font-mono break-all">
              {user.walletAddress}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Calificación como Cliente
            </label>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                {user.clientScore.toFixed(1)}
              </span>
              <div className="flex text-yellow-400">
                {'★'.repeat(Math.round(user.clientScore))}
                {'☆'.repeat(5 - Math.round(user.clientScore))}
              </div>
            </div>
          </div>

          <div className="bg-green-50 dark:bg-green-900/20 p-4 rounded-lg">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Calificación como Proveedor
            </label>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold text-green-600 dark:text-green-400">
                {user.providerScore.toFixed(1)}
              </span>
              <div className="flex text-yellow-400">
                {'★'.repeat(Math.round(user.providerScore))}
                {'☆'.repeat(5 - Math.round(user.providerScore))}
              </div>
            </div>
          </div>
        </div>

        <div className="border-t pt-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold">Especialidades</h2>
            {!editing && (
              <button
                onClick={() => setEditing(true)}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                {isProvider ? 'Editar' : 'Añadir Especialidades'}
              </button>
            )}
          </div>

          {editing ? (
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                Selecciona tus especialidades para aparecer como proveedor en las búsquedas
              </p>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
                {allSpecialties.map((specialty) => (
                  <label
                    key={specialty}
                    className="flex items-center space-x-2 p-3 border rounded-lg cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700"
                  >
                    <input
                      type="checkbox"
                      checked={selectedSpecialties.includes(specialty)}
                      onChange={() => handleSpecialtyToggle(specialty)}
                      className="w-4 h-4 text-blue-600 rounded"
                    />
                    <span className="text-sm">{SPECIALTY_LABELS[specialty]}</span>
                  </label>
                ))}
              </div>
              <div className="flex gap-3">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                >
                  {saving ? 'Guardando...' : 'Guardar'}
                </button>
                <button
                  onClick={() => {
                    setEditing(false);
                    setSelectedSpecialties(user.specialties || []);
                  }}
                  className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <div>
              {isProvider ? (
                <div className="flex flex-wrap gap-2">
                  {user.specialties.map((specialty) => (
                    <span
                      key={specialty}
                      className="px-3 py-1 bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 rounded-full text-sm"
                    >
                      {SPECIALTY_LABELS[specialty]}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500 dark:text-gray-400 italic">
                  No tienes especialidades configuradas. Añade algunas para aparecer como proveedor.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


