import React from 'react';

const GlassCard = ({ children, className = '', hover = false }) => {
  return (
    <div className={`glass-panel rounded-2xl p-6 ${hover ? 'glass-panel-hover' : ''} ${className}`}>
      {children}
    </div>
  );
};

export default GlassCard;
