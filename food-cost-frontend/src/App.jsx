import React, { useEffect, useState } from 'react';
import {
  BrowserRouter as Router,
  Route,
  Routes,
  Link,
  useParams
} from 'react-router-dom';
import { GoogleOAuthProvider, GoogleLogin } from '@react-oauth/google';
import { jwtDecode } from 'jwt-decode';
import Logo from './assets/logo.png';
import EditItem from './EditItem';
import IngredientsPage from './IngredientsPage';
import IngredientDetail from './IngredientDetail';
import NewItemPage from './NewItemPage';
import ItemsLanding from './ItemsLanding';
import ItemDetail from './ItemDetail';
import EditIngredient from './EditIngredient'; 
import NewPriceQuoteForm from './NewPriceQuoteForm';
import Prices from './Prices';



const API_URL = 'https://jaybird-connect.ue.r.appspot.com/api';
const GOOGLE_CLIENT_ID =
  '209658083912-mlsfml13aa444o0j7ipj3lkbbjf7mmlg.apps.googleusercontent.com';
const ALLOWED_DOMAINS = [
  'byjaybird.com',
  'thebagelbin.com',
  'mustardpretzel.com',
  'sonomas.net'
];

function Header({ user, onLogout }) {
  return (
    <header className="bg-white shadow-md py-4 px-6 flex items-center justify-between">
      <div className="flex items-center space-x-4">
        <Link to="/">
          <img src={Logo} alt="Jaybird Connect logo" className="h-10" />
        </Link>
        <Link to="/" className="text-sm font-semibold text-gray-700 hover:text-black">
          Items
        </Link>
        <Link to="/ingredients" className="text-sm font-semibold text-gray-700 hover:text-black">
          Ingredients
        </Link>
        <Link to="/prices" className="text-sm font-semibold text-gray-700 hover:text-black">
          Prices
        </Link>
      </div>
      {user && (
        <div className="flex items-center space-x-4">
          <span className="font-medium text-gray-600">{user.name}</span>
          <button
            onClick={onLogout}
            className="bg-red-500 hover:bg-red-600 text-white text-sm px-3 py-1 rounded transition"
          >
            Logout
          </button>
        </div>
      )}
    </header>
  );
}

function ItemList() {
  const [itemsByCategory, setItemsByCategory] = useState({});
  const [expandedCategories, setExpandedCategories] = useState({});

  useEffect(() => {
    fetch(`${API_URL}/items`)
      .then((res) => res.json())
      .then((data) => {
        const visibleItems = data.filter((item) => !!item.is_for_sale);
        const grouped = visibleItems.reduce((acc, item) => {
          const category = item.category || 'Uncategorized';
          if (!acc[category]) acc[category] = [];
          acc[category].push(item);
          return acc;
        }, {});
        setItemsByCategory(grouped);
      });
  }, []);

  const toggleCategory = (category) => {
    setExpandedCategories((prev) => ({
      ...prev,
      [category]: !prev[category]
    }));
  };

  return (
    <div className="p-4">
      <h1 className="text-3xl font-bold mb-6">Menu Items</h1>
      {Object.entries(itemsByCategory).map(([category, items]) => (
        <div key={category} className="mb-4 border rounded shadow-sm">
          <button
            onClick={() => toggleCategory(category)}
            className="w-full flex justify-between items-center bg-gray-100 p-4 text-left font-semibold text-lg"
          >
            <span>{category}</span>
            <span>{expandedCategories[category] ? '▲' : '▼'}</span>
          </button>
          {expandedCategories[category] && (
            <ul className="p-4 bg-white border-t space-y-2">
              {items.map((item) => (
                <li key={item.item_id} className="hover:text-blue-600">
                  <div className="flex justify-between items-center">
                    <Link
                      to={`/item/${item.item_id}`}
                      className="text-blue-600 hover:underline"
                    >
                      {item.name}
                    </Link>
                    <Link
                      to={`/item/${item.item_id}/edit`}
                      className="text-sm text-gray-500 hover:text-black ml-4"
                    >
                      ✏️ Edit
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}

function AuthGate({ children, setAppUser }) {
  const [user, setUser] = useState(() => JSON.parse(localStorage.getItem('user')));

  useEffect(() => {
    if (user) {
      setAppUser(user);
    }
  }, [user, setAppUser]);

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center h-screen">
        <h1 className="text-2xl mb-4">Log in to access Jaybird Connect</h1>
        <GoogleLogin
          onSuccess={(credentialResponse) => {
            const decoded = jwtDecode(credentialResponse.credential);
            const domain = decoded.hd || '';
            if (!ALLOWED_DOMAINS.includes(domain)) {
              alert('Access denied. Must log in with a company email.');
              return;
            }
            localStorage.setItem('user', JSON.stringify(decoded));
            setUser(decoded);

            fetch(`${API_URL}/log-login`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                email: decoded.email,
                name: decoded.name,
                domain: domain,
                timestamp: new Date().toISOString()
              })
            }).catch((err) => console.error('Failed to log login event:', err));
          }}
          onError={() => console.error('Login Failed')}
        />
      </div>
    );
  }

  return children;
}

function App() {
  const [user, setUser] = useState(() => JSON.parse(localStorage.getItem('user')));

  const handleLogout = () => {
    localStorage.removeItem('user');
    setUser(null);
    window.location.href = '/'; // Forces reload to login screen
  };

  return (
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
      <AuthGate setAppUser={setUser}>
        <Router>
          <Header user={user} onLogout={handleLogout} />
          <Routes>
            <Route path="/" element={<ItemsLanding />} />
            <Route path="/item/:id" element={<ItemDetail />} />
            <Route path="/item/:id/edit" element={<EditItem />} />
            <Route path="/item/new" element={<NewItemPage />} />
            <Route path="/ingredients" element={<IngredientsPage />} />
            <Route path="/ingredients/:id" element={<IngredientDetail />} />
            <Route path="/ingredients/:id/edit" element={<EditIngredient />} />
            <Route path="/prices" element={<Prices />} />
            <Route path="/prices/new" element={<NewPriceQuoteForm />} />
          </Routes>
        </Router>
      </AuthGate>
    </GoogleOAuthProvider>
  );
}

export default App;
