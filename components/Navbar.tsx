'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/navigation';

export default function Navbar() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [balance, setBalance] = useState<string | null>(null);
  const [loadingBalance, setLoadingBalance] = useState(false);

  useEffect(() => {
    if (user?.id) {
      fetchBalance();
    }
  }, [user?.id]);

  const fetchBalance = async () => {
    if (!user?.id) return;
    setLoadingBalance(true);
    try {
      const res = await fetch(`/api/users/${user.id}/balance`);
      if (res.ok) {
        const data = await res.json();
        setBalance(data.balance);
      }
    } catch (error) {
      console.error('Error fetching balance:', error);
    } finally {
      setLoadingBalance(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    router.push('/login');
  };

  return (
    <nav className="bg-white dark:bg-gray-800 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center">
            <a href="/" className="text-xl font-bold">
              Service Platform
            </a>
          </div>
          <div className="flex items-center space-x-4">
            <a href="/" className="text-gray-700 dark:text-gray-300 hover:text-gray-900">
              Inicio
            </a>
            <a href="/jobs" className="text-gray-700 dark:text-gray-300 hover:text-gray-900">
              Trabajos
            </a>
            {user ? (
              <>
                <a href="/profile" className="text-gray-700 dark:text-gray-300 hover:text-gray-900">
                  Perfil
                </a>
                <div className="flex flex-col items-end">
                  <span className="text-gray-700 dark:text-gray-300 text-sm">
                    {user.email}
                  </span>
                  {loadingBalance ? (
                    <span className="text-xs text-gray-500 dark:text-gray-400">Cargando...</span>
                  ) : balance !== null ? (
                    <span className="text-xs text-green-600 dark:text-green-400 font-semibold">
                      {parseFloat(balance).toFixed(4)} ETH
                    </span>
                  ) : null}
                </div>
                <button
                  onClick={handleLogout}
                  className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm"
                >
                  Cerrar Sesión
                </button>
              </>
            ) : (
              <a
                href="/login"
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
              >
                Iniciar Sesión
              </a>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}

