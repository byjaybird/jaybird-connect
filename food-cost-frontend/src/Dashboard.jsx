import React from 'react';
import { Link } from 'react-router-dom';

// A simple dashboard root with quick access cards to the main sections
export default function Dashboard() {
  const cards = [
    { title: 'Menu', href: '/menu', icon: '🍽️' },
    { title: 'Prices', href: '/prices', icon: '💲' },
    { title: 'Inventory', href: '/inventory', icon: '📦' },
    { title: 'Users', href: '/users', icon: '👥' },
    { title: 'Shifts', href: '/shifts/dashboard', icon: '🕒' },
    { title: 'Tasks', href: '/tasks', icon: '✅' },
  ];

  return (
    <main className="p-6">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-semibold mb-6">Dashboard</h1>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {cards.map((c) => (
            <Link to={c.href} key={c.title} className="group block rounded-xl border border-gray-200 p-6 bg-white hover:bg-gray-50">
              <div className="flex items-center justify-between">
                <span className="text-3xl">{c.icon}</span>
                <span className="text-sm font-semibold text-gray-700">{c.title}</span>
              </div>
              <div className="mt-2 text-sm text-gray-500">Open {c.title} area</div>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
