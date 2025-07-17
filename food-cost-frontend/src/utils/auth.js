export const checkAuthStatus = async () => {
  const token = localStorage.getItem('token');
  if (!token) {
    throw new Error('No token found');
  }

  try {
    const response = await fetch('https://jaybird-connect.ue.r.appspot.com/api/auth/check', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      credentials: 'include'
    });

    if (!response.ok) {
      throw new Error('Auth check failed');
    }

    return true;
  } catch (error) {
    console.error('Auth check error:', error);
    localStorage.removeItem('token'); // Clear invalid token
    throw error;
  }
};

export const getAuthHeaders = () => {
  const token = localStorage.getItem('token');
  return {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  };
};