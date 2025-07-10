import React, { useState, useEffect } from 'react';
import axios from 'axios';

const NewReceivingForm = () => {
    const [receiveDate, setReceiveDate] = useState('');
    const [supplier, setSupplier] = useState('');
    const [items, setItems] = useState([{ ingredientId: '', units: '', unitType: '', pricePerUnit: '' }]);
    const [ingredients, setIngredients] = useState([]);

    useEffect(() => {
        const fetchIngredients = async () => {
            try {
                const response = await axios.get('/api/ingredients');
                setIngredients(response.data.filter(ingredient => !ingredient.archived));
        } catch (error) {
                console.error("Error fetching ingredients", error);
        }
    };

        fetchIngredients();
    }, []);

    const handleChange = (index, event) => {
        const newItems = [...items];
        newItems[index][event.target.name] = event.target.value;
        setItems(newItems);
};

    const addNewRow = () => {
        setItems([...items, { ingredientId: '', units: '', unitType: '', pricePerUnit: '' }]);
    };

    const handleSubmit = async (event) => {
        event.preventDefault();
        try {
            const response = await axios.post('/submit-receiving', {
                receiveDate,
                supplier,
                items
            });
            console.log(response.data);
        } catch (error) {
            console.error("There was an error submitting the data!", error);
        }
    };

    return (
        <form onSubmit={handleSubmit}>
            <label>Date Received:</label>
            <input type="date" value={receiveDate} onChange={e => setReceiveDate(e.target.value)} required />

            <label>Supplier:</label>
            <input type="text" value={supplier} onChange={e => setSupplier(e.target.value)} required />

            {items.map((item, index) => (
                <div key={index}>
                    <select name="ingredientId" value={item.ingredientId} onChange={e => handleChange(index, e)} required>
                        <option value="">Select Ingredient</option>
                        {ingredients.map(ingredient => (
                            <option key={ingredient.ingredient_id} value={ingredient.ingredient_id}>
                                {ingredient.name}
                            </option>
                        ))}
                    </select>
                    <input type="number" name="units" value={item.units} onChange={e => handleChange(index, e)} placeholder="Units" required />
                    <input type="text" name="unitType" value={item.unitType} onChange={e => handleChange(index, e)} placeholder="Unit Type" required />
                    <input type="number" step="0.01" name="pricePerUnit" value={item.pricePerUnit} onChange={e => handleChange(index, e)} placeholder="Price Per Unit" required />
                </div>
            ))}
            <button type="button" onClick={addNewRow}>+</button>
            <button type="submit">Submit</button>
        </form>
    );
};

export default NewReceivingForm;