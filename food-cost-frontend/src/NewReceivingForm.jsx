import React, { useState, useEffect } from 'react';
import { api, checkAuthStatus } from './utils/auth';
import { useNavigate, useLocation } from 'react-router-dom';

// Use the shared `api` axios instance which injects auth headers and base URL


const NewReceivingForm = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const [receiveDate, setReceiveDate] = useState('');
    const [supplier, setSupplier] = useState('');
    const [items, setItems] = useState([{ ingredientId: '', units: '', unitType: '', pricePerUnit: '' }]);
    const [ingredients, setIngredients] = useState([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    useEffect(() => {
        let mounted = true;
        async function init() {
            try {
                await checkAuthStatus();
            } catch (err) {
                // checkAuthStatus will clear token on 401; navigate to login
                console.warn('Not authenticated, redirecting to login', err);
                navigate('/login', { state: { from: location.pathname } });
                return;
            }

            try {
                const response = await api.get('/api/ingredients');
                if (!mounted) return;
                if (Array.isArray(response.data)) {
                    setIngredients(response.data.filter(ingredient => !ingredient.archived));
                } else {
                    console.error("Unexpected data format:", response.data);
                    setIngredients([]);
                }
            } catch (error) {
                console.error("Error fetching ingredients", error);
                if (error?.response?.status === 401) {
                    navigate('/login', { state: { from: location.pathname } });
                    return;
                }
                setError("Failed to load ingredients. Please refresh the page.");
                setIngredients([]);
            }
        }

        init();
        return () => { mounted = false; };
    }, [navigate]);

    const handleChange = (index, event) => {
        const newItems = [...items];
        newItems[index][event.target.name] = event.target.value;
        setItems(newItems);
    };

    const addNewRow = () => {
        setItems([...items, { ingredientId: '', units: '', unitType: '', pricePerUnit: '' }]);
    };

    const removeRow = (index) => {
        if (items.length > 1) {
            const newItems = items.filter((_, i) => i !== index);
            setItems(newItems);
        }
    };

    const handleSubmit = async (event) => {
        event.preventDefault();
        setIsSubmitting(true);
        setError('');
        setSuccess('');

        try {
            const response = await api.post('/api/receiving', {
                receiveDate,
                supplier,
                items
            });
            setSuccess('Receiving record created successfully!');
            setTimeout(() => {
                navigate('/prices');
            }, 2000);
        } catch (error) {
            setError('Failed to submit receiving record. Please try again.');
            console.error("Submission error:", error);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="max-w-6xl mx-auto p-6">
            <div className="mb-6">
                <h1 className="text-2xl font-bold text-gray-800">New Receiving Record</h1>
                <p className="text-gray-600">Enter the details of received goods</p>
            </div>

            {error && (
                <div className="mb-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded">
                    {error}
                </div>
            )}

            {success && (
                <div className="mb-4 p-4 bg-green-100 border border-green-400 text-green-700 rounded">
                    {success}
                </div>
            )}

            <form onSubmit={handleSubmit} className="bg-white shadow-md rounded-lg p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                    <div>
                        <label className="block text-gray-700 text-sm font-bold mb-2">
                            Date Received
                        </label>
                        <input
                            type="date"
                            value={receiveDate}
                            onChange={e => setReceiveDate(e.target.value)}
                            className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
                            required
                            autoComplete="on"
                        />
                    </div>
                    <div>
                        <label className="block text-gray-700 text-sm font-bold mb-2">
                            Supplier
                        </label>
                        <input
                            type="text"
                            value={supplier}
                            onChange={e => setSupplier(e.target.value)}
                            className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
                            placeholder="Enter supplier name"
                            required
                            autoComplete="organization"
                        />
                    </div>
                </div>

                <div className="mb-6">
                    <div className="flex justify-between items-center mb-4">
                        <h2 className="text-lg font-semibold text-gray-700">Received Items</h2>
                        <button
                            type="button"
                            onClick={addNewRow}
                            className="bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline flex items-center"
                        >
                            <span className="mr-2">Add Item</span>
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" clipRule="evenodd" />
                            </svg>
                        </button>
                    </div>

                    {items.map((item, index) => (
                        <div key={index} className="bg-gray-50 p-4 rounded-lg mb-4">
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                <div>
                                    <label className="block text-gray-700 text-sm font-bold mb-2">
                                        Ingredient
                                    </label>
                                    <select
                                        name="ingredientId"
                                        value={item.ingredientId}
                                        onChange={e => handleChange(index, e)}
                                        className="shadow border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
                                        required
                                        aria-label="Ingredient"
                                    >
                                        <option value="">Select Ingredient</option>
                                        {ingredients.map(ingredient => (
                                            <option key={ingredient.ingredient_id} value={ingredient.ingredient_id}>
                                                {ingredient.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-gray-700 text-sm font-bold mb-2">
                                        Quantity
                                    </label>
                                    <input
                                        type="number"
                                        name="units"
                                        value={item.units}
                                        onChange={e => handleChange(index, e)}
                                        className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
                                        placeholder="Enter quantity"
                                        required
                                        autoComplete="off"
                                    />
                                </div>
                                <div>
                                    <label className="block text-gray-700 text-sm font-bold mb-2">
                                        Unit Type
                                    </label>
                                    <input
                                        type="text"
                                        name="unitType"
                                        value={item.unitType}
                                        onChange={e => handleChange(index, e)}
                                        className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
                                        placeholder="e.g., lbs, kg, cases"
                                        required
                                        autoComplete="off"
                                    />
                                </div>
                                <div>
                                    <label className="block text-gray-700 text-sm font-bold mb-2">
                                        Price Per Unit
                                    </label>
                                    <div className="relative">
                                        <span className="absolute left-3 top-2 text-gray-600">$</span>
                                        <input
                                            type="number"
                                            step="0.01"
                                            name="pricePerUnit"
                                            value={item.pricePerUnit}
                                            onChange={e => handleChange(index, e)}
                                            className="shadow appearance-none border rounded w-full py-2 pl-8 pr-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
                                            placeholder="0.00"
                                            required
                                            autoComplete="off"
                                        />
                                    </div>
                                </div>
                            </div>
                            {items.length > 1 && (
                                <button
                                    type="button"
                                    onClick={() => removeRow(index)}
                                    className="mt-2 text-red-500 hover:text-red-700"
                                >
                                    Remove Item
                                </button>
                            )}
                        </div>
                    ))}
                </div>

                <div className="flex items-center justify-end gap-4">
                    <button
                        type="button"
                        onClick={() => navigate('/prices')}
                        className="bg-gray-500 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline"
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        disabled={isSubmitting}
                        className={`bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline ${isSubmitting ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                        {isSubmitting ? 'Submitting...' : 'Submit Receiving Record'}
                    </button>
                </div>
            </form>
        </div>
    );
};

export default NewReceivingForm;