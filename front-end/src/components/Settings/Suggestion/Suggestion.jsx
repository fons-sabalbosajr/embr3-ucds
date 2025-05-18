import React, { useState, useEffect } from 'react';
import './suggestion.css';
import { FiSend, FiMail } from 'react-icons/fi';

const Suggestion = ({ name, username, theme = 'light' }) => {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    suggestion: ''
  });

  useEffect(() => {
    if (name) {
      setFormData(prev => ({ ...prev, name }));
    }
  }, [name]);

  const handleChange = (e) => {
    setFormData(prev => ({
      ...prev,
      [e.target.name]: e.target.value
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    alert('Thank you for your suggestion!');
    setFormData({ name: name || '', email: '', suggestion: '' });
  };

  return (
    <div className={`suggestion-wrapper ${theme}`}>
      <div className="suggestion-card">
        <h2>Suggest a Feature</h2>
        <p>We value your input. Help us improve your experience.</p>

        <form onSubmit={handleSubmit}>
          <input
            type="text"
            name="name"
            placeholder="Your Name"
            value={formData.name}
            onChange={handleChange}
            required
          />
          <input
            type="email"
            name="email"
            placeholder="Your Email"
            value={formData.email}
            onChange={handleChange}
            required
          />
          <textarea
            name="suggestion"
            placeholder="Your Feature Suggestion..."
            rows="4"
            value={formData.suggestion}
            onChange={handleChange}
            required
          />
          <button type="submit">
            <FiSend /> Submit
          </button>
        </form>

        <div className="contact-section">
          <FiMail />
          <span>Contact us at: <a href="mailto:emb.idms@gmail.com">emb.idms@gmail.com</a></span>
        </div>
      </div>
    </div>
  );
};

export default Suggestion;
