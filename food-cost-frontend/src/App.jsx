import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Route, Routes, Link, useParams, Navigate } from 'react-router-dom';
import { GoogleOAuthProvider, GoogleLogin, useGoogleLogin } from '@react-oauth/google';
import { jwtDecode } from 'jwt-decode';

const API_URL = 'https://jaybird-connect.ue.r.appspot.com/api';
const GOOGLE_CLIENT_ID = '209658083912-mlsfml13aa444o0j7ipj3lkbbjf7mmlg.apps.googleusercontent.com';
const ALLOWED_DOMAINS = ['byjaybird.com', 'thebagelbin.com', 'mustardpretzel.com', 'sonomas.net'];

function ItemList() {
  const [items, setItems] = useState([]);

  useEffect(() => {
    fetch(`${API_URL}/items`)
      .then(res => res.json())
      .then(setItems);
  }, []);

  const forSaleItems = items.filter(item => item[4] === 1);

  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">Menu Items</h1>
      <ul className="space-y-2">
        {forSaleItems.map(item => (
          <li key={item[0]} className="border p-2 rounded hover:bg-gray-100">
            <Link to={`/item/${item[0]}`} className="text-blue-600 hover:underline">
              {item[1]}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ItemDetail() {
  const { id } = useParams();
  const [recipe, setRecipe] = useState([]);
  const [itemInfo, setItemInfo] = useState(null);

  useEffect(() => {
    fetch(`${API_URL}/recipes/${id}`)
      .then(res => res.json())
      .then(setRecipe);

    fetch(`${API_URL}/items/${id}`)
      .then(res => res.json())
      .then(setItemInfo);
  }, [id]);

  return (
    <div className="p-4">
      {itemInfo && (
        <div className="mb-4">
          <h2 className="text-2xl font-bold">{itemInfo[1]}</h2>
          {itemInfo[5] && <p className="text-gray-700 italic mb-2">{itemInfo[5]}</p>}
          {itemInfo[7] && <p className="text-sm text-gray-600">Notes: {itemInfo[7]}</p>}
        </div>
      )}
      <h3 className="text-xl font-semibold mb-2">Recipe Ingredients</h3>
      <ul className="space-y-1">
        {recipe.map((r, idx) => (
          <li key={idx} className="border p-2 rounded">
            <strong>{r[2]}</strong> – {r[3]} {r[4]}
            {r[5] && <div className="text-sm text-gray-600">{r[5]}</div>}
          </li>
        ))}
      </ul>
      <Link to="/" className="mt-4 inline-block text-blue-600 hover:underline">Back to Menu</Link>
    </div>
  );
}

function AuthGate({ children }) {
  const [user, setUser] = useState(() => JSON.parse(localStorage.getItem('user')));

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center h-screen">
        <h1 className="text-2xl mb-4">Log in to access Jaybird Connect</h1>
        <GoogleLogin
          onSuccess={credentialResponse => {
            const decoded = jwtDecode(credentialResponse.credential);
            const domain = decoded.hd || '';
            if (!ALLOWED_DOMAINS.includes(domain)) {
              alert('Access denied. Must log in with a company email.');
              return;
            }
            localStorage.setItem('user', JSON.stringify(decoded));
            setUser(decoded);

            // Log login event to backend
            fetch(`${API_URL}/log-login`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                email: decoded.email,
                name: decoded.name,
                domain: domain,
                timestamp: new Date().toISOString()
              })
            }).catch(err => console.error('Failed to log login event:', err));
          }}
          onError={() => console.error('Login Failed')}
        />
      </div>
    );
  }

  return children;
}

function App() {
  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <AuthGate>
        <Router>
          <Routes>
            <Route path="/" element={<ItemList />} />
            <Route path="/item/:id" element={<ItemDetail />} />
          </Routes>
        </Router>
      </AuthGate>
    </GoogleOAuthProvider>
  );
}

export default App;
