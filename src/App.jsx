import React, { useState, useRef, useEffect, useCallback } from 'react';
import { PenTool, Calendar, DollarSign, User, Building, Phone, Mail, FileText, Check, X, Printer, Send, Settings, ChevronDown, Users, MapPin, AlertTriangle, Loader, QrCode, Copy, ExternalLink, Link as LinkIcon, RefreshCw, Trash2, Download, Database, Globe, Plus, Image as ImageIcon, Type, Lock, Percent, Edit2, Upload, RotateCcw, AlertCircle, Briefcase, Undo, LogOut } from 'lucide-react';
// FIREBASE & PDF IMPORTS
import { pdf } from '@react-pdf/renderer';
import { OfferPdfDocument } from './OfferPdf';
import { initializeApp } from "firebase/app";
import { getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager, doc, getDoc, getDocs, setDoc, collection, addDoc, deleteDoc, onSnapshot, query, orderBy, updateDoc } from "firebase/firestore";
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged, sendPasswordResetEmail } from "firebase/auth";

// ==============================================================================
// CONFIGURATION
// ==============================================================================

console.table({
  'API Key exists': !!import.meta.env.VITE_FIREBASE_API_KEY,
  'Project ID': import.meta.env.VITE_FIREBASE_PROJECT_ID,
  'Auth Domain': import.meta.env.VITE_FIREBASE_AUTH_DOMAIN
});

const CONST_GOOGLE_MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_KEY;
const CONST_WEBHOOK_URL = "https://n8n.srv971972.hstgr.cloud/webhook/prd-dapto-offer-form";

const CONST_FIREBASE_CONFIG = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

// Remove the red placeholder logo - start with empty string
const ORIGINAL_DEFAULT_LOGO = "";

const DEFAULT_PLACEHOLDERS = {
  purchasePrice: '',
  financeDate: '',
  inspectionDate: '',
  settlementDate: '',
  specialConditions: ''
};

const DEFAULT_AGENTS = [
  { name: 'General Office', email: 'admin@prddapto.com.au', mobile: '', title: 'Sales Team' }
];

// ==============================================================================
// HELPERS
// ==============================================================================

const calculateDeposit = (price, percent) => {
  const numPrice = parseFloat(String(price).replace(/[^0-9.]/g, ''));
  const numPercent = parseFloat(percent);
  if (isNaN(numPrice) || isNaN(numPercent)) return '';
  return Math.round(numPrice * (numPercent / 100)).toLocaleString();
};

const formatCurrency = (value) => {
  const num = String(value).replace(/[^0-9]/g, '');
  if (!num) return '';
  return parseInt(num).toLocaleString();
};

// Smart deposit calculation helper
const calculateSmartDeposit = (purchasePrice, depositPercent) => {
  if (!depositPercent) return null;
  
  const priceValue = purchasePrice.replace(/[^0-9]/g, '');
  const price = parseInt(priceValue);
  
  if (price) {
    const deposit = Math.round(price * (depositPercent / 100));
    return {
      amount: deposit.toLocaleString(),
      calculation: `${depositPercent}% of purchase price`
    };
  }
  return null;
};

// Auto-save helpers
const AUTOSAVE_KEY = 'prd-dapto-offer-draft';
const AUTOSAVE_INTERVAL = 3000; // 3 seconds

const saveDraft = (formData) => {
  try {
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify({
      ...formData,
      timestamp: Date.now()
    }));
  } catch (e) {
    console.warn('Could not save draft:', e);
  }
};

const loadDraft = () => {
  try {
    const saved = localStorage.getItem(AUTOSAVE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      // Only load if less than 24 hours old
      if (Date.now() - parsed.timestamp < 24 * 60 * 60 * 1000) {
        delete parsed.timestamp;
        return parsed;
      }
    }
  } catch (e) {
    console.warn('Could not load draft:', e);
  }
  return null;
};

const clearDraft = () => {
  try {
    localStorage.removeItem(AUTOSAVE_KEY);
  } catch (e) {
    console.warn('Could not clear draft:', e);
  }
};

// Progress tracking helper - enhanced with sections
const FORM_SECTIONS = [
  { id: 'agent', label: 'Agent', icon: User, fields: ['agentName'] },
  { id: 'property', label: 'Property', icon: Building, fields: ['propertyAddress'] },
  { id: 'buyer', label: 'Buyer', icon: Users, fields: [] },
  { id: 'solicitor', label: 'Solicitor', icon: Briefcase, fields: ['solicitorEmail', 'solicitorPhone'] },
  { id: 'price', label: 'Price', icon: DollarSign, fields: ['purchasePrice', 'initialDeposit', 'balanceDeposit'] },
  { id: 'conditions', label: 'Conditions', icon: Calendar, fields: [] },
  { id: 'signature', label: 'Sign', icon: PenTool, fields: [] }
];

const getRequiredFields = () => [
  'agentName', 'propertyAddress', 'buyerName1', 'buyerAddress', 
  'buyerPhone', 'buyerEmail', 'purchasePrice', 'depositAmount', 
  'signature'
];



// COPY THIS ENTIRE FUNCTION
// Replace your old calculateProgress with this:

const calculateProgress = (formData) => {
  const buyers = formData.buyers || [];

  let completed = 0;
  let total = 3; // Base fields: agent, property, price

  // Check main fields
  if (formData.agentName) completed++;
  if (formData.propertyAddress) completed++;
  if (formData.purchasePrice) completed++;

  // Solicitor: always 1 item — complete when checkbox ticked OR email+phone filled
  total += 1;
  if (formData.solicitorToBeAdvised || (formData.solicitorEmail && formData.solicitorPhone)) {
    completed++;
  }
  
  // Check each buyer (add to total dynamically)
  buyers.forEach(buyer => {
    if (buyer.isEntity) {
      total += 3; // entityName, abn, acn
      if (buyer.entityName) completed++;
      if (buyer.abn) completed++;
      if (buyer.acn) completed++;
    } else {
      total += 2; // firstName, surname
      if (buyer.firstName) completed++;
      if (buyer.surname) completed++;
    }
    
    total += 4; // email, phone, address, signature (for all buyers)
    if (buyer.email) completed++;
    if (buyer.phone) completed++;
    if (buyer.address) completed++;
    if (buyer.signature) completed++;
  });
  
  return {
    completed,
    total,
    percentage: total > 0 ? Math.round((completed / total) * 100) : 0
  };
};

const getSectionStatus = (formData, section, features = {}) => {
  // Special handling for Buyer section
  if (section.id === 'buyer') {
    const buyers = formData.buyers || [];
    if (buyers.length === 0) return 'empty';
    
    let hasAnyComplete = false;
    let allComplete = true;
    
    buyers.forEach(buyer => {
      const hasName = buyer.isEntity 
        ? (buyer.entityName && buyer.entityName.trim())
        : (buyer.firstName && buyer.firstName.trim() && buyer.surname && buyer.surname.trim());
      
      const hasEmail = buyer.email && buyer.email.trim();
      const hasPhone = buyer.phone && buyer.phone.trim();
      const hasAddress = buyer.address && buyer.address.trim();
      const hasContact = hasEmail && hasPhone && hasAddress;
      
      const buyerComplete = hasName && hasContact;
      
      if (buyerComplete) {
        hasAnyComplete = true;
      } else {
        allComplete = false;
      }
    });
    
    if (allComplete && hasAnyComplete) return 'complete';
    if (hasAnyComplete) return 'partial';
    return 'empty';
  }
  
  // Special handling for Signature section
  if (section.id === 'signature') {
    const buyers = formData.buyers || [];
    if (buyers.length === 0) return 'empty';
    
    const allSigned = buyers.every(buyer => buyer.signature);
    const anySigned = buyers.some(buyer => buyer.signature);
    
    if (allSigned) return 'complete';
    if (anySigned) return 'partial';
    return 'empty';
  }
  
  // Special handling for Price section (deposits may be off)
  if (section.id === 'price') {
    const priceFields = features.showDeposits
      ? ['purchasePrice', 'initialDeposit', 'balanceDeposit']
      : ['purchasePrice'];
    const filled = priceFields.filter(f => formData[f] && String(formData[f]).trim().length > 0);
    if (filled.length === priceFields.length) return 'complete';
    if (filled.length > 0) return 'partial';
    return 'empty';
  }

  // Special handling for Conditions section
  if (section.id === 'conditions') {
    const conditionFields = [
      ...(features.showFinance ? ['financeDate'] : []),
      ...(features.showBuildingPest ? ['inspectionDate'] : []),
      'settlementDate'
    ];
    const filledFields = conditionFields.filter(field => {
      const value = formData[field];
      return value && String(value).trim().length > 0;
    });
    
    // Complete when all available date fields are filled (or at least 2 if 3 are available)
    if (conditionFields.length > 0 && filledFields.length >= Math.min(2, conditionFields.length)) return 'complete';
    if (filledFields.length > 0) return 'partial';
    return 'optional'; // Show as optional if nothing filled
  }
  
  // Special handling for Solicitor section
  if (section.id === 'solicitor') {
    // If "to be advised" is checked, section is complete
    if (formData.solicitorToBeAdvised) return 'complete';
    
    // Otherwise, check email and phone
    const hasEmail = formData.solicitorEmail && formData.solicitorEmail.trim();
    const hasPhone = formData.solicitorPhone && formData.solicitorPhone.trim();
    
    if (hasEmail && hasPhone) return 'complete';
    if (hasEmail || hasPhone) return 'partial';
    return 'empty';
  }

  // Optional sections (no required fields)
  if (section.fields.length === 0) return 'optional';
  
  // Standard handling for other sections
  const completedFields = section.fields.filter(field => {
    const value = formData[field];
    return value && String(value).trim().length > 0;
  });
  
  if (completedFields.length === section.fields.length) return 'complete';
  if (completedFields.length > 0) return 'partial';
  return 'empty';
};


// ==============================================================================
// COMPONENTS
// ==============================================================================

// Shared Placeholder Fields component (used in both Settings tab and QR Customise section)
const PlaceholderFields = ({ values, onChange }) => (
  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
    {/* Purchase Price */}
    <div>
      <label className="text-xs text-slate-500 block mb-1">Purchase Price (Default)</label>
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">$</span>
        <input type="text" value={values.purchasePrice || ''} onChange={(e) => onChange(p => ({ ...p, purchasePrice: formatCurrency(e.target.value) }))} className="w-full border border-slate-300 rounded p-2 pl-7 text-sm" placeholder="e.g. 850,000" />
      </div>
    </div>
    {/* Finance Date */}
    <div>
      <label className="text-xs text-slate-500 block mb-1">Finance Date (Default)</label>
      <input type="text" value={values.financeDate || ''} onChange={(e) => onChange(p => ({ ...p, financeDate: e.target.value }))} className="w-full border border-slate-300 rounded p-2 text-sm" placeholder="e.g. 14 days from contract date" />
    </div>
    {/* Inspection Date */}
    <div>
      <label className="text-xs text-slate-500 block mb-1">Inspection Date (Default)</label>
      <input type="text" value={values.inspectionDate || ''} onChange={(e) => onChange(p => ({ ...p, inspectionDate: e.target.value }))} className="w-full border border-slate-300 rounded p-2 text-sm" placeholder="e.g. 14 days from contract date" />
    </div>
    {/* Settlement Date */}
    <div>
      <label className="text-xs text-slate-500 block mb-1">Settlement Date (Default)</label>
      <input type="text" value={values.settlementDate || ''} onChange={(e) => onChange(p => ({ ...p, settlementDate: e.target.value }))} className="w-full border border-slate-300 rounded p-2 text-sm" placeholder="e.g. 30 days from contract date" />
    </div>
    {/* Special Conditions */}
    <div className="md:col-span-2">
      <label className="text-xs text-slate-500 block mb-1">Special Conditions (Default)</label>
      <textarea value={values.specialConditions || ''} onChange={(e) => onChange(p => ({ ...p, specialConditions: e.target.value }))} className="w-full border border-slate-300 rounded p-2 text-sm" placeholder="e.g. Subject to building and pest inspection" rows="3" />
    </div>
  </div>
);

// Mobile Progress Bar Component (horizontal, top of screen)
const MobileProgressBar = ({ formData, isQRForm = false }) => {
  const progress = calculateProgress(formData);
  
  return (
    <div className={`lg:hidden sticky top-0 ${!isQRForm ? 'sm:top-[56px]' : ''} z-40 bg-white shadow-sm border-b border-slate-200 print:hidden`}>
      <div className="w-full px-3 py-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-medium text-slate-700">Progress</span>
          <span className="text-xs text-slate-500">
            {progress.completed}/{progress.total} done
          </span>
        </div>
        <div className="w-full bg-slate-200 rounded-full h-1.5">
          <div 
            className="bg-red-600 h-1.5 rounded-full transition-all duration-300 ease-in-out" 
            style={{ width: `${progress.percentage}%` }}
          />
        </div>
      </div>
    </div>
  );
};

// Desktop Floating Sidebar Progress Component
const DesktopProgressSidebar = ({ formData, isQRForm = false, features = {} }) => {
  const progress = calculateProgress(formData);
  
  const scrollToSection = (sectionId) => {
    const element = document.getElementById(`section-${sectionId}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };
  
  return (
    <div className="hidden lg:block fixed left-4 top-1/2 -translate-y-1/2 z-40 print:hidden">
      <div className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-sm border border-slate-100 p-4 w-44">
        {/* Progress Circle */}
        <div className="flex items-center justify-center mb-4">
          <div className="relative w-20 h-20">
            <svg className="w-20 h-20 transform -rotate-90">
              <circle
                cx="40"
                cy="40"
                r="36"
                stroke="#e2e8f0"
                strokeWidth="6"
                fill="none"
              />
              <circle
                cx="40"
                cy="40"
                r="36"
                stroke="#dc2626"
                strokeWidth="6"
                fill="none"
                strokeLinecap="round"
                strokeDasharray={`${2 * Math.PI * 36}`}
                strokeDashoffset={`${2 * Math.PI * 36 * (1 - progress.percentage / 100)}`}
                className="transition-all duration-500 ease-out"
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-base font-semibold text-slate-700">{progress.percentage}%</span>
            </div>
          </div>
        </div>
        
        {/* Section Steps */}
        <div className="space-y-1">
          {FORM_SECTIONS.map((section, index) => {
            const status = getSectionStatus(formData, section, features);
            const Icon = section.icon;
            
            return (
              <button
                key={section.id}
                onClick={() => scrollToSection(section.id)}
                className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left transition-colors text-xs ${
                  status === 'complete' 
                    ? 'bg-green-50 text-green-700' 
                    : status === 'partial'
                    ? 'bg-amber-50 text-amber-700'
                    : status === 'optional'
                    ? 'bg-slate-50 text-slate-500'
                    : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                }`}
              >
                <div className={`w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 ${
                  status === 'complete' 
                    ? 'bg-green-500 text-white' 
                    : status === 'partial'
                    ? 'bg-amber-500 text-white'
                    : 'bg-slate-200 text-slate-500'
                }`}>
                  {status === 'complete' ? (
                    <Check className="w-3 h-3" />
                  ) : (
                    <span className="text-xs font-medium">{index + 1}</span>
                  )}
                </div>
                <span className="font-medium truncate">{section.label}</span>
              </button>
            );
          })}
        </div>
        
        {/* Completion text */}
        <div className="mt-4 pt-3 border-t border-slate-100 text-center">
          <span className="text-[10px] text-slate-400 font-medium uppercase tracking-wide">
            {progress.completed} of {progress.total} fields
          </span>
        </div>
      </div>
    </div>
  );
};

// Auto-save Indicator Component
const AutoSaveIndicator = ({ show }) => {
  return (
    <div className={`fixed bottom-3 right-3 sm:bottom-4 sm:right-4 z-50 transition-all duration-300 ${show ? 'opacity-100' : 'opacity-0'} print:hidden`}>
      <div className="bg-green-500 text-white px-2 sm:px-3 py-1 rounded-full text-xs sm:text-sm font-medium flex items-center gap-1">
        <Check className="w-3 h-3" />
        <span className="hidden xs:inline">Draft </span>saved
      </div>
    </div>
  );
};

const SectionHeader = ({ icon: Icon, title, id }) => (
  <div id={id ? `section-${id}` : undefined} className="flex items-center gap-2 border-b border-slate-300 pb-2 mb-5 mt-10 scroll-mt-24 lg:scroll-mt-8">
    <Icon className="w-4 h-4 text-red-600" />
    <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{title}</h2>
  </div>
);

const InputField = ({ label, name, type = "text", value, onChange, placeholder, className = "", required = false, inputRef, icon: Icon, readOnly = false, prefix, error = false }) => {
  const isCompleted = required && value && String(value).trim().length > 0;
  
  return (
    <div className={`flex flex-col ${className}`}>
      <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-[0.1em] mb-1.5 flex items-center gap-1">
        {label} {required && <span className="text-red-500">*</span>}
        {Icon && <Icon className="w-3 h-3 text-slate-400" />}
      </label>
      <div className="relative">
        {prefix && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 font-medium">{prefix}</span>
        )}
        <input
          ref={inputRef}
          type={type}
          name={name}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          readOnly={readOnly}
          className={`bg-white border rounded-md px-3 py-2.5 text-sm focus:outline-none transition-colors w-full ${
            prefix ? 'pl-7' : ''
          } ${
            error
              ? 'border-red-500 bg-red-50 focus:border-red-500 focus:ring-1 focus:ring-red-500/30'
              : readOnly
                ? 'bg-slate-100 text-slate-600 border-slate-200 cursor-not-allowed'
                : 'border-slate-200 focus:border-red-500 focus:ring-1 focus:ring-red-500/30'
          } ${isCompleted ? 'pr-8' : ''}`}
          autoComplete={name === "propertyAddress" ? "off" : "on"}
          id={name} 
          required={required}
        />
        {isCompleted && (
          <div className="absolute right-2 top-1/2 -translate-y-1/2 text-green-500">
            <Check className="w-4 h-4 animate-in fade-in-0 zoom-in-50 duration-200" />
          </div>
        )}
      </div>
    </div>
  );
};

const Checkbox = ({ label, name, checked, onChange }) => (
  <div className="flex items-center gap-2 mt-4 cursor-pointer" onClick={() => onChange({ target: { name, type: 'checkbox', checked: !checked } })}>
    <div className={`w-5 h-5 border rounded flex items-center justify-center transition-colors ${checked ? 'bg-red-600 border-red-600' : 'border-slate-300 bg-white'}`}>
      {checked && <Check className="w-3 h-3 text-white" />}
    </div>
    <span className="text-sm font-medium text-slate-700 select-none">{label}</span>
  </div>
);

// Enhanced Signature Pad with Undo functionality
const EnhancedSignaturePad = ({ onEnd, onClear, signatureData, error, label = "Sign Here" }) => {
  const canvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [strokes, setStrokes] = useState([]);
  const [currentStroke, setCurrentStroke] = useState([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
      const ctx = canvas.getContext('2d');
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.strokeStyle = 'black';
    }
  }, []);

  const redrawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'black';
    
    strokes.forEach(stroke => {
      if (stroke.length > 0) {
        ctx.beginPath();
        ctx.moveTo(stroke[0].x, stroke[0].y);
        stroke.forEach(point => ctx.lineTo(point.x, point.y));
        ctx.stroke();
      }
    });
  }, [strokes]);

  useEffect(() => {
    redrawCanvas();
  }, [strokes, redrawCanvas]);

  const getEventPos = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const clientX = e.clientX || (e.touches && e.touches[0].clientX);
    const clientY = e.clientY || (e.touches && e.touches[0].clientY);
    return {
      x: clientX - rect.left,
      y: clientY - rect.top
    };
  };

  const startDrawing = (e) => {
    e.preventDefault();
    const pos = getEventPos(e);
    setIsDrawing(true);
    setCurrentStroke([pos]);
  };

  const draw = (e) => {
    if (!isDrawing) return;
    e.preventDefault();
    
    const pos = getEventPos(e);
    setCurrentStroke(prev => {
      const newStroke = [...prev, pos];
      
      // Draw current stroke in real time
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (prev.length > 0) {
        ctx.beginPath();
        ctx.moveTo(prev[prev.length - 1].x, prev[prev.length - 1].y);
        ctx.lineTo(pos.x, pos.y);
        ctx.stroke();
      }
      
      return newStroke;
    });
  };

  const endDrawing = () => {
    if (isDrawing && currentStroke.length > 0) {
      setStrokes(prev => [...prev, currentStroke]);
      setCurrentStroke([]);
      const canvas = canvasRef.current;
      onEnd(canvas.toDataURL());
    }
    setIsDrawing(false);
  };

  const clear = (e) => {
    e.stopPropagation();
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setStrokes([]);
    setCurrentStroke([]);
    onClear();
  };

  const undo = (e) => {
    e.stopPropagation();
    if (strokes.length > 0) {
      const newStrokes = strokes.slice(0, -1);
      setStrokes(newStrokes);
      
      // Update canvas and callback
      setTimeout(() => {
        const canvas = canvasRef.current;
        if (newStrokes.length === 0) {
          onClear();
        } else {
          onEnd(canvas.toDataURL());
        }
      }, 10);
    }
  };

  return (
    <div className={`relative w-full h-40 border-2 border-dashed rounded bg-slate-50 hover:bg-white transition-colors touch-none ${error ? 'border-red-500 bg-red-50' : 'border-slate-300'}`}>
      {!signatureData && strokes.length === 0 && (
        <div className={`absolute inset-0 flex items-center justify-center pointer-events-none text-sm ${error ? 'text-red-600 font-bold' : 'text-slate-400'}`}>
          {error ? 'Signature Required' : label}
        </div>
      )}
      <canvas
        ref={canvasRef}
        className="w-full h-full cursor-crosshair"
        onMouseDown={startDrawing}
        onMouseMove={draw}
        onMouseUp={endDrawing}
        onMouseLeave={endDrawing}
        onTouchStart={startDrawing}
        onTouchMove={draw}
        onTouchEnd={endDrawing}
        style={{
          backgroundImage: 'linear-gradient(to right, #e5e7eb 1px, transparent 1px), linear-gradient(to bottom, #e5e7eb 1px, transparent 1px)',
          backgroundSize: '20px 20px'
        }}
      />
      <div className="absolute top-2 right-2 flex gap-1">
        <button 
          type="button" 
          onClick={undo} 
          disabled={strokes.length === 0}
          className="p-1 bg-white shadow rounded hover:text-blue-600 text-slate-500 disabled:text-slate-300 disabled:cursor-not-allowed transition-colors" 
          title="Undo Last Stroke"
        >
          <Undo className="w-4 h-4" />
        </button>
        <button 
          type="button" 
          onClick={clear} 
          className="p-1 bg-white shadow rounded hover:text-red-600 text-slate-500 transition-colors" 
          title="Clear Signature"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

// ==============================================================================
// MAIN APP
// ==============================================================================

export default function App() {
  const [formData, setFormData] = useState(() => {
    const base = {
      agentName: '',
      agentEmail: '',
      agentMobile: '',
      agentTitle: '',
      agentPhoto: '',
      propertyAddress: '',
      buyers: [{
        isEntity: false,
        firstName: '',
        middleName: '',
        surname: '',
        entityName: '',
        abn: '',
        acn: '',
        email: '',
        phone: '',
        address: '',
        signature: null,
        signatureDate: new Date().toISOString().split('T')[0]
      }],
      solicitorCompany: '',
      solicitorContact: '',
      solicitorEmail: '',
      solicitorPhone: '',
      solicitorToBeAdvised: false,
      purchasePrice: '',
      initialDeposit: '',
      balanceDeposit: '',
      balanceDepositPercent: '10',
      balanceDepositTerms: '',
      financeDate: '',
      financePreApproved: false,
      coolingOffPeriod: '5',
      waiverCoolingOff: false,
      inspectionDate: '',
      settlementDate: '',
      specialConditions: ''
    };
    // Pre-populate agent from cache for slug URLs (/hayley) so header
    // renders immediately without waiting for the loadFromUrl effect
    try {
      const slug = window.location.pathname.split('/').filter(Boolean)[0];
      if (slug) {
        const cached = localStorage.getItem('cachedAgents');
        if (cached) {
          const agents = JSON.parse(cached);
          const agent = agents.find(a => a.slug === slug);
          if (agent) {
            return { ...base, agentName: agent.name, agentEmail: agent.email || '', agentPhoto: agent.photo || '', agentMobile: agent.mobile || '', agentTitle: agent.title || '' };
          }
        }
      }
    } catch (e) {}
    return base;
  });

  // UI State
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [adminTab, setAdminTab] = useState('qr');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState(null);
  const [adminUser, setAdminUser] = useState(null);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({});
  const [showAutoSave, setShowAutoSave] = useState(false);
  const [activeBuyerTab, setActiveBuyerTab] = useState(0);
  
  // Data State
  const [isMapsLoaded, setIsMapsLoaded] = useState(false);
  const [mapsError, setMapsError] = useState(null);
  const [isAgentPrefilled, setIsAgentPrefilled] = useState(false);
  const [isAddressPrefilled, setIsAddressPrefilled] = useState(false);
  const [manualAddressEntry, setManualAddressEntry] = useState(false);
  const [agentsList, setAgentsList] = useState(() => {
    try {
      const cached = localStorage.getItem('cachedAgents');
      if (cached) return JSON.parse(cached);
    } catch (e) {}
    return DEFAULT_AGENTS;
  });
  const [logoUrl, setLogoUrl] = useState(() => localStorage.getItem('cachedLogoUrl') || '');
  const [defaultLogoUrl, setDefaultLogoUrl] = useState('');
  const [placeholders, setPlaceholders] = useState(DEFAULT_PLACEHOLDERS);
  const [features, setFeatures] = useState({ showDeposits: false, showBuildingPest: false, showFinance: false });
  const [logoGallery, setLogoGallery] = useState([]);

  // Admin UI State
  const [newAgentName, setNewAgentName] = useState('');
  const [newAgentEmail, setNewAgentEmail] = useState('');
  const [newAgentMobile, setNewAgentMobile] = useState('');
  const [newAgentTitle, setNewAgentTitle] = useState('');
  const [newAgentPhoto, setNewAgentPhoto] = useState('');
  const [newAgentTestAgent, setNewAgentTestAgent] = useState(false);

  const [tempLogoUrl, setTempLogoUrl] = useState('');
  const [tempPlaceholders, setTempPlaceholders] = useState(DEFAULT_PLACEHOLDERS);
  const [tempFeatures, setTempFeatures] = useState({ showDeposits: false, showBuildingPest: false, showFinance: false });
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [isUploadingAgentPhoto, setIsUploadingAgentPhoto] = useState(false);
  const [newLogoName, setNewLogoName] = useState('');
  
  const [photoFile, setPhotoFile] = useState(null); 
  const [editPhotoFile, setEditPhotoFile] = useState(null);
  
  const [editingAgent, setEditingAgent] = useState(null);
  const [editAgentName, setEditAgentName] = useState('');
  const [editAgentEmail, setEditAgentEmail] = useState('');
  const [editAgentMobile, setEditAgentMobile] = useState('');
  const [editAgentTitle, setEditAgentTitle] = useState('');
  const [editAgentPhoto, setEditAgentPhoto] = useState('');
  const [editAgentSlug, setEditAgentSlug] = useState('');
  const [editAgentTestAgent, setEditAgentTestAgent] = useState(false);
  const [newAgentSlug, setNewAgentSlug] = useState('');

  const [agentModeData, setAgentModeData] = useState({ agentName: '', propertyAddress: '' });
  const [shortLink, setShortLink] = useState('');
  const [isGeneratingLink, setIsGeneratingLink] = useState(false);
  const [qrGenerated, setQrGenerated] = useState(false);
  const [agentModeReady, setAgentModeReady] = useState(false);

  const [qrCustomiseOpen, setQrCustomiseOpen] = useState(false);
  const [qrLogoUrl, setQrLogoUrl] = useState('');
  const [qrPlaceholders, setQrPlaceholders] = useState(DEFAULT_PLACEHOLDERS);
  
  const urlParams = new URLSearchParams(window.location.search);
  const propertyId = urlParams.get('id');
  const pathParts = window.location.pathname.split('/').filter(Boolean);
  const agentSlug = pathParts[0] || '';
  const isQRCodeForm = !!propertyId || !!agentSlug;
  const isDevMode = urlParams.get('dev') === 'true';
  
  const addressInputRef = useRef(null);
  const agentAddressInputRef = useRef(null);
  const autocompleteInstance = useRef(null);
  const agentAutocompleteInstance = useRef(null);
  
  const dbRef = useRef(null);
  const storageRef = useRef(null);
  const authRef = useRef(null);
  
  const logoInputRef = useRef(null);
  const newAgentPhotoInputRef = useRef(null);
  const editAgentPhotoInputRef = useRef(null);
  const formContainerRef = useRef(null);
  const autoSaveTimeoutRef = useRef(null);
  const propertySettingsApplied = useRef(false);

  // ==============================================================================
  // AUTO-SAVE FUNCTIONALITY
  // ==============================================================================

  // Auto-save effect
  useEffect(() => {
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
    }

    autoSaveTimeoutRef.current = setTimeout(() => {
      saveDraft(formData);
      setShowAutoSave(true);
      setTimeout(() => setShowAutoSave(false), 2000);
    }, AUTOSAVE_INTERVAL);

    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
    };
  }, [formData]);

  // Load draft on component mount (skip for QR code / agent-prefilled forms)
  useEffect(() => {
    if (!isAgentPrefilled && !isQRCodeForm) {
      const draft = loadDraft();
      if (draft) {
        setFormData(prev => ({ ...prev, ...draft }));
      }
    }
  }, [isAgentPrefilled, isQRCodeForm]);

  // Cache logo URL for instant display on next visit
  useEffect(() => {
    if (logoUrl) localStorage.setItem('cachedLogoUrl', logoUrl);
  }, [logoUrl]);

  // Cache agents list for instant population on next visit
  useEffect(() => {
    if (agentsList.length > 0 && agentsList !== DEFAULT_AGENTS) {
      localStorage.setItem('cachedAgents', JSON.stringify(agentsList));
    }
  }, [agentsList]);

  // ==============================================================================
  // INITIALIZATION
  // ==============================================================================

  useEffect(() => {
    if (CONST_FIREBASE_CONFIG && !dbRef.current) {
      try {
        const app = initializeApp(CONST_FIREBASE_CONFIG);
        dbRef.current = getFirestore(app);
        storageRef.current = getStorage(app);
        authRef.current = getAuth(app);
        onAuthStateChanged(authRef.current, (user) => setAdminUser(user));

        // Eager fetch agents immediately (faster than waiting for onSnapshot)
        const qAgents = query(collection(dbRef.current, "agents"), orderBy("name"));
        getDocs(qAgents).then((snap) => {
          if (!snap.empty) {
            const loaded = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            setAgentsList(loaded);
          }
        }).catch(e => console.warn('Eager agents fetch failed:', e));

        // Then subscribe for real-time updates
        const unsubAgents = onSnapshot(qAgents, (snap) => {
          if (!snap.empty) {
            const loaded = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            setAgentsList(loaded);
          }
        });

        const qLogos = query(collection(dbRef.current, "logos"), orderBy("uploadedAt", "desc"));
        const unsubLogos = onSnapshot(qLogos, (snap) => {
          const loaded = snap.docs
  .map(d => ({ id: d.id, ...d.data() }))
  .filter(logo => logo.url && logo.url.trim() !== ''); // Only show logos with valid URLs
          if (loaded.length === 0) {
            addDoc(collection(dbRef.current, "logos"), {
              name: "Default Logo",
              url: ORIGINAL_DEFAULT_LOGO,
              isDefault: true,
              uploadedAt: new Date().toISOString()
            });
          } else {
            setLogoGallery(loaded);
          }
        });

        const docRef = doc(dbRef.current, "config", "settings");
        const unsubSettings = onSnapshot(docRef, async (docSnap) => {
          if (docSnap.exists()) {
            const data = docSnap.data();
            if (data.defaultLogoUrl) setDefaultLogoUrl(data.defaultLogoUrl);
            // Only apply global logo/placeholders if no per-property override is active
            if (!propertySettingsApplied.current) {
              if (data.logoUrl) setLogoUrl(data.logoUrl);
              if (data.placeholders) {
                setPlaceholders({ ...DEFAULT_PLACEHOLDERS, ...data.placeholders });
              }
            }
            // Always update temp values (for Settings tab editing)
            if (data.logoUrl) setTempLogoUrl(data.logoUrl);
            if (data.placeholders) {
              setTempPlaceholders({ ...DEFAULT_PLACEHOLDERS, ...data.placeholders });
            }
            // Load feature flags
            if (data.features) {
              setFeatures(prev => ({ ...prev, ...data.features }));
              setTempFeatures(prev => ({ ...prev, ...data.features }));
            }
          } else {
            await setDoc(docRef, {
              defaultLogoUrl: ORIGINAL_DEFAULT_LOGO,
              logoUrl: ORIGINAL_DEFAULT_LOGO,
              placeholders: DEFAULT_PLACEHOLDERS,
              features: { showDeposits: false, showBuildingPest: false, showFinance: false }
            });
            setDefaultLogoUrl(ORIGINAL_DEFAULT_LOGO);
            if (!propertySettingsApplied.current) {
              setLogoUrl(ORIGINAL_DEFAULT_LOGO);
            }
            setTempLogoUrl(ORIGINAL_DEFAULT_LOGO);
          }
        });

        return () => { unsubAgents(); unsubSettings(); unsubLogos(); };
      } catch (e) {
        console.error("Firebase Init Error:", e);
      }
    }
  }, []);

  useEffect(() => {
    if (!CONST_GOOGLE_MAPS_KEY) return;
    window.initGoogleMaps = () => { setIsMapsLoaded(true); setMapsError(null); };
    window.gm_authFailure = () => { setMapsError("Invalid Maps Key"); setIsMapsLoaded(false); };

    if (window.google?.maps?.places) { setIsMapsLoaded(true); return; }
    if (document.getElementById('gmaps-script')) return;

    const script = document.createElement('script');
    script.id = 'gmaps-script';
    script.src = `https://maps.googleapis.com/maps/api/js?key=${CONST_GOOGLE_MAPS_KEY}&libraries=places&callback=initGoogleMaps`;
    script.async = true;
    script.defer = true;
    document.head.appendChild(script);
  }, []);

  // Main Form Autocomplete
  useEffect(() => {
    if (isMapsLoaded && !mapsError && addressInputRef.current && !autocompleteInstance.current && !isAddressPrefilled && !manualAddressEntry) {
      try {
        const ac = new window.google.maps.places.Autocomplete(addressInputRef.current, {
          types: ['address'],
          componentRestrictions: { country: 'au' },
          fields: ['formatted_address']
        });
        autocompleteInstance.current = ac;
        ac.addListener('place_changed', () => {
          const place = ac.getPlace();
          if (place.formatted_address) {
            const cleanAddress = place.formatted_address.replace(/, Australia$/, '');
            setFormData(prev => ({ ...prev, propertyAddress: cleanAddress }));
          }
        });
      } catch (e) { console.error(e); }
    }
  }, [isMapsLoaded, mapsError, isAddressPrefilled, manualAddressEntry]);

  // Admin Panel Autocomplete
  useEffect(() => {
    if (showAdminPanel && adminTab === 'qr' && isMapsLoaded && !mapsError) {
      if (agentAutocompleteInstance.current) {
        window.google.maps.event.clearInstanceListeners(agentAutocompleteInstance.current);
        agentAutocompleteInstance.current = null;
      }
      setAgentModeReady(false);
      
      const timer = setTimeout(() => {
        if (agentAddressInputRef.current) {
          try {
            const ac = new window.google.maps.places.Autocomplete(agentAddressInputRef.current, {
              types: ['address'], 
              componentRestrictions: { country: 'au' }, 
              fields: ['formatted_address']
            });
            agentAutocompleteInstance.current = ac;
            ac.addListener('place_changed', () => {
              const place = ac.getPlace();
              if (place.formatted_address) {
                const cleanAddress = place.formatted_address.replace(/, Australia$/, '');
                setAgentModeData(prev => ({ ...prev, propertyAddress: cleanAddress }));
                setShortLink('');
                setQrGenerated(false);
              }
            });
            setAgentModeReady(true);
          } catch (e) { console.error(e); }
        }
      }, 500); 
      
      return () => {
        clearTimeout(timer);
        if (agentAutocompleteInstance.current) {
          window.google.maps.event.clearInstanceListeners(agentAutocompleteInstance.current);
        }
      };
    }
  }, [showAdminPanel, adminTab, isMapsLoaded, mapsError]);

  useEffect(() => {
    const loadFromUrl = async () => {
      if (agentsList.length === 0) return;

      const params = new URLSearchParams(window.location.search);
      const id = params.get('id');

      let foundAgentName = '';
      let foundAddress = '';

      if (id && dbRef.current) {
        // Property-specific shortlink (?id=abc123)
        try {
          const snap = await getDoc(doc(dbRef.current, "shortlinks", id));
          if (snap.exists()) {
            const data = snap.data();
            foundAgentName = data.agent || '';
            foundAddress = data.address || '';
            if (data.logoUrl) {
              setLogoUrl(data.logoUrl);
              propertySettingsApplied.current = true;
            }
            if (data.placeholders) {
              setPlaceholders({ ...DEFAULT_PLACEHOLDERS, ...data.placeholders });
              propertySettingsApplied.current = true;
            }
          }
        } catch (e) { console.error(e); }
        if (foundAgentName) setIsAgentPrefilled(true);
        if (foundAddress) setIsAddressPrefilled(true);
      } else if (agentSlug) {
        // Agent slug path (/jake) — agent-only, buyer fills in address
        const agent = agentsList.find(a => a.slug === agentSlug);
        if (agent) {
          foundAgentName = agent.name;
          setIsAgentPrefilled(true);
          // isAddressPrefilled stays false — buyer fills in address
        }
      } else {
        // Legacy query params (?a=Name&p=Address)
        foundAgentName = params.get('agent') || params.get('a') || '';
        foundAddress = params.get('address') || params.get('p') || '';
        if (foundAgentName) setIsAgentPrefilled(true);
        if (foundAddress) setIsAddressPrefilled(true);
      }

      if (foundAgentName) {
        const agentDetails = agentsList.find(a => a.name === foundAgentName);
        setFormData(prev => ({
          ...prev,
          agentName: foundAgentName,
          propertyAddress: foundAddress || prev.propertyAddress,
          agentEmail: agentDetails ? agentDetails.email : prev.agentEmail,
          agentPhoto: agentDetails ? agentDetails.photo : '',
          agentMobile: agentDetails ? agentDetails.mobile : '',
          agentTitle: agentDetails ? agentDetails.title : ''
        }));
      } else if (foundAddress) {
        setFormData(prev => ({ ...prev, propertyAddress: foundAddress }));
      }
    };

    loadFromUrl();
  }, [agentsList]);

  // ==============================================================================
  // HANDLERS
  // ==============================================================================

  const openAdminPanel = () => {
    if (adminUser) {
      setAgentModeData({ agentName: formData.agentName || '', propertyAddress: formData.propertyAddress || '' });
      setShortLink(''); setQrGenerated(false);
      setQrLogoUrl(logoUrl || tempLogoUrl); setQrPlaceholders({ ...placeholders }); setQrCustomiseOpen(false);
      setShowAdminPanel(true); setAdminTab('qr');
    } else {
      setLoginError('');
      setLoginEmail('');
      setLoginPassword('');
      setShowLoginModal(true);
    }
  };

  const handleLogin = async () => {
    if (!loginEmail || !loginPassword) { setLoginError('Please enter email and password.'); return; }
    setLoginLoading(true);
    setLoginError('');
    try {
      await signInWithEmailAndPassword(authRef.current, loginEmail, loginPassword);
      setShowLoginModal(false);
      setAgentModeData({ agentName: formData.agentName || '', propertyAddress: formData.propertyAddress || '' });
      setShortLink(''); setQrGenerated(false);
      setQrLogoUrl(logoUrl || tempLogoUrl); setQrPlaceholders({ ...placeholders }); setQrCustomiseOpen(false);
      setShowAdminPanel(true); setAdminTab('qr');
    } catch (err) {
      setLoginError(err.code === 'auth/invalid-credential' ? 'Invalid email or password.' : err.message);
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(authRef.current);
      setShowAdminPanel(false);
      setEditingAgent(null);
    } catch (err) {
      console.error('Sign out error:', err);
    }
  };

  const handleForgotPassword = async () => {
    if (!loginEmail) { setLoginError('Enter your email above first, then click Forgot password.'); return; }
    try {
      await sendPasswordResetEmail(authRef.current, loginEmail);
      setLoginError('');
      alert('Password reset email sent to ' + loginEmail + '. Check your inbox.');
    } catch (err) {
      setLoginError(err.code === 'auth/user-not-found' ? 'No account found with that email.' : err.message);
    }
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;

    if (fieldErrors[name]) {
      setFieldErrors(prev => { const n = { ...prev }; delete n[name]; return n; });
    }

    if (name === 'purchasePrice') {
      const formatted = formatCurrency(value);
      const priceNum = parseInt(String(value).replace(/[^0-9]/g, '')) || 0;
      const initialDep = priceNum ? Math.round(priceNum * 0.0025).toLocaleString() : '';
      const initialDepNum = Math.round(priceNum * 0.0025);
      const balanceDep = priceNum ? Math.round(priceNum * (parseInt(formData.balanceDepositPercent) / 100) - initialDepNum).toLocaleString() : '';
      setFormData(prev => ({ ...prev, purchasePrice: formatted, initialDeposit: initialDep, balanceDeposit: balanceDep }));
    } else if (name === 'balanceDepositPercent') {
      const priceNum = parseInt(String(formData.purchasePrice).replace(/[^0-9]/g, '')) || 0;
      const initialDepNum = Math.round(priceNum * 0.0025);
      const balanceDep = priceNum ? Math.round(priceNum * (parseInt(value) / 100) - initialDepNum).toLocaleString() : '';
      setFormData(prev => ({ ...prev, balanceDepositPercent: value, balanceDeposit: balanceDep }));
    } else if (name === 'solicitorToBeAdvised') {
      setFormData(prev => ({
        ...prev,
        solicitorToBeAdvised: checked,
        ...(checked ? { solicitorCompany: '', solicitorContact: '', solicitorEmail: '', solicitorPhone: '' } : {})
      }));
    } else {
      setFormData(prev => ({ ...prev, [name]: type === 'checkbox' ? checked : value }));
    }
  };

  const handleAgentChange = (e) => {
    if (fieldErrors.agentName) {
      setFieldErrors(prev => { const n = { ...prev }; delete n.agentName; return n; });
    }
    const selected = agentsList.find(a => a.name === e.target.value);
    setFormData(prev => ({ 
      ...prev, 
      agentName: e.target.value, 
      agentEmail: selected ? selected.email : '',
      agentPhoto: selected ? selected.photo : '',
      agentMobile: selected ? selected.mobile : '',
      agentTitle: selected ? selected.title : ''
    }));
  };

  const handleBuyerChange = (buyerIndex, field, value) => {
    setFormData(prev => {
      const newBuyers = [...prev.buyers];
      newBuyers[buyerIndex] = { ...newBuyers[buyerIndex], [field]: value };
      return { ...prev, buyers: newBuyers };
    });
    
    const errorKey = `buyer${buyerIndex}_${field}`;
    if (fieldErrors[errorKey]) {
      setFieldErrors(prev => { const n = { ...prev }; delete n[errorKey]; return n; });
    }
  };

  const handleEntityToggle = (buyerIndex) => {
    setFormData(prev => {
      const newBuyers = [...prev.buyers];
      newBuyers[buyerIndex] = { ...newBuyers[buyerIndex], isEntity: !newBuyers[buyerIndex].isEntity };
      return { ...prev, buyers: newBuyers };
    });
  };

  const addBuyer = () => {
    setFormData(prev => ({
      ...prev,
      buyers: [...prev.buyers, {
        isEntity: false,
        firstName: '',
        middleName: '',
        surname: '',
        entityName: '',
        abn: '',
        acn: '',
        email: '',
        phone: '',
        address: '',
        signature: null,
        signatureDate: new Date().toISOString().split('T')[0]
      }]
    }));
    setActiveBuyerTab(formData.buyers.length);
  };

  const removeBuyer = (buyerIndex) => {
    if (formData.buyers.length === 1) {
      alert("You must have at least one buyer.");
      return;
    }
    
    setFormData(prev => ({
      ...prev,
      buyers: prev.buyers.filter((_, i) => i !== buyerIndex)
    }));
    
    if (activeBuyerTab >= formData.buyers.length - 1) {
      setActiveBuyerTab(Math.max(0, buyerIndex - 1));
    }
  };

  const handleSignatureEnd = (buyerIndex, dataUrl) => {
    handleBuyerChange(buyerIndex, 'signature', dataUrl);
    const errorKey = `buyer${buyerIndex}_signature`;
    if (fieldErrors[errorKey]) {
      setFieldErrors(prev => { const n = { ...prev }; delete n[errorKey]; return n; });
    }
  };

  const handleSignatureClear = (buyerIndex) => {
    handleBuyerChange(buyerIndex, 'signature', null);
  };
  
  const handlePrint = () => {
    window.print();
  };

  const getBalanceDepositPlaceholder = () => {
    if (placeholders.balanceDepositAmount) return placeholders.balanceDepositAmount;
    if (placeholders.balanceDepositPercent) {
      if (formData.purchasePrice) {
        const calc = calculateDeposit(formData.purchasePrice, placeholders.balanceDepositPercent);
        if (calc) return `${calc} (${placeholders.balanceDepositPercent}% of purchase price)`;
      }
      return `Enter purchase price to calculate ${placeholders.balanceDepositPercent}%`;
    }
    return '';
  };

  const validateForm = () => {
    const errors = {};
    if (!formData.agentName) errors.agentName = 'Selling Agent is required';
    if (!formData.propertyAddress) errors.propertyAddress = 'Property Address is required';
    if (!formData.purchasePrice) errors.purchasePrice = 'Purchase Price is required';
    if (features.showDeposits) {
      if (!formData.initialDeposit) errors.initialDeposit = 'Initial Deposit is required';
      if (!formData.balanceDeposit) errors.balanceDeposit = 'Balance Deposit is required';
    }
    // Solicitor validation - only required if NOT "to be advised"
if (!formData.solicitorToBeAdvised) {
  if (!formData.solicitorEmail) errors.solicitorEmail = 'Solicitor Email is required';
  if (!formData.solicitorPhone) errors.solicitorPhone = 'Solicitor Phone is required';
}
    
    // Validate buyers
    formData.buyers.forEach((buyer, index) => {
      if (buyer.isEntity) {
        if (!buyer.entityName) errors[`buyer${index}_entityName`] = `Buyer ${index + 1} Entity Name is required`;
        if (!buyer.abn) errors[`buyer${index}_abn`] = `Buyer ${index + 1} ABN is required`;
        if (!buyer.acn) errors[`buyer${index}_acn`] = `Buyer ${index + 1} ACN is required`;
      } else {
        if (!buyer.firstName) errors[`buyer${index}_firstName`] = `Buyer ${index + 1} First Name is required`;
        if (!buyer.surname) errors[`buyer${index}_surname`] = `Buyer ${index + 1} Surname is required`;
      }
      if (!buyer.email) errors[`buyer${index}_email`] = `Buyer ${index + 1} Email is required`;
      if (!buyer.phone) errors[`buyer${index}_phone`] = `Buyer ${index + 1} Phone is required`;
      if (!buyer.address) errors[`buyer${index}_address`] = `Buyer ${index + 1} Address is required`;
      if (!buyer.signature) errors[`buyer${index}_signature`] = `Buyer ${index + 1} Signature is required`;
    });
    
    return errors;
  };

  const generatePDF = async () => {
    try {
      const blob = await pdf(
        <OfferPdfDocument formData={formData} logoUrl={logoUrl} features={features} />
      ).toBlob();
      
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(blob);
        reader.onloadend = () => {
          const base64data = reader.result;
          const rawBase64 = base64data.split(',')[1];
          resolve(rawBase64); 
        };
        reader.onerror = reject;
      });
    } catch (e) {
      console.error('PDF generation error:', e);
      return null;
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setFieldErrors({}); 
    
    const errors = validateForm();
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    
    setIsSubmitting(true);

    // Clear the draft when successfully submitting
    clearDraft();

    const currentAgent = agentsList.find(a => a.name === formData.agentName);
    
    let pdfBase64 = null;
    try { pdfBase64 = await generatePDF(); } catch (e) { console.error('PDF Error:', e); }
    
    
    
    // Calculate total deposit
    const initialDepositNum = parseFloat(String(formData.initialDeposit).replace(/[^0-9.]/g, '')) || 0;
    const balanceDepositNum = parseFloat(String(formData.balanceDeposit).replace(/[^0-9.]/g, '')) || 0;
    const totalDeposit = initialDepositNum + balanceDepositNum;
    
    const payload = {
      ...formData,
      logoUrl: logoUrl,
      agentMobile: currentAgent?.mobile || formData.agentMobile || '',
      agentTitle: currentAgent?.title || formData.agentTitle || '',
      testAgent: currentAgent?.testAgent || false,
      totalDeposit: features.showDeposits ? totalDeposit.toLocaleString() : '',
      initialDeposit: features.showDeposits ? formData.initialDeposit : '',
      balanceDeposit: features.showDeposits ? formData.balanceDeposit : '',
      balanceDepositTerms: features.showDeposits ? formData.balanceDepositTerms : '',
      inspectionDate: features.showBuildingPest ? formData.inspectionDate : '',
      financeDate: features.showFinance ? formData.financeDate : '',
      financePreApproved: features.showFinance ? formData.financePreApproved : false,
      settlementDate: formData.settlementDate,
      showDeposits: features.showDeposits,
      showBuildingPest: features.showBuildingPest,
      showFinance: features.showFinance,
      submittedAt: new Date().toISOString(),
      pdfBase64,
      pdfFilename: `Offer_${formData.propertyAddress.replace(/[^a-z0-9]/gi, '_').substring(0, 30)}_${new Date().toISOString().split('T')[0]}.pdf`
    };

    if (CONST_WEBHOOK_URL) {
      try {
        const res = await fetch(CONST_WEBHOOK_URL, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
        });
        if (res.ok) { setSubmitStatus('success'); window.scrollTo({ top: 0, behavior: 'smooth' }); }
        else { setSubmitStatus('error'); alert("Failed to send."); }
      } catch (e) { setSubmitStatus('error'); alert("Network Error"); }
    } else {
      setTimeout(() => { setSubmitStatus('success'); window.scrollTo({ top: 0, behavior: 'smooth' }); }, 1000);
    }
    setIsSubmitting(false);
  };

  // (Additional handler functions remain the same as original...)
  const generateSmartLink = async () => {
    if (!agentModeData.agentName) return;
    setIsGeneratingLink(true);
    let finalUrl = '';

    if (agentModeData.propertyAddress) {
      // Property-specific QR — save shortlink to Firestore
      if (dbRef.current) {
        try {
          const uniqueId = Math.random().toString(36).substring(2, 7);
          await setDoc(doc(dbRef.current, "shortlinks", uniqueId), {
            agent: agentModeData.agentName,
            address: agentModeData.propertyAddress,
            placeholders: qrPlaceholders,
            createdAt: new Date().toISOString()
          });
          finalUrl = `${window.location.origin}/?id=${uniqueId}`;
        } catch (e) { console.error(e); }
      }
      if (!finalUrl) {
        finalUrl = `${window.location.origin}/?a=${encodeURIComponent(agentModeData.agentName)}&p=${encodeURIComponent(agentModeData.propertyAddress)}`;
      }
    } else {
      // Agent-only QR — use clean slug path
      const agent = agentsList.find(a => a.name === agentModeData.agentName);
      if (agent?.slug) {
        finalUrl = `${window.location.origin}/${agent.slug}`;
      } else {
        finalUrl = `${window.location.origin}/?a=${encodeURIComponent(agentModeData.agentName)}`;
      }
    }

    setShortLink(finalUrl);
    setIsGeneratingLink(false);
    setQrGenerated(true);
  };

  const handleSaveSettings = async () => {
    if (!dbRef.current) { alert("Database not connected."); return; }
    try {
      await setDoc(doc(dbRef.current, "config", "settings"), {
        logoUrl: tempLogoUrl,
        placeholders: tempPlaceholders,
        features: tempFeatures
      }, { merge: true });
      alert("Settings Saved!");
    } catch (e) { alert("Save failed."); console.error(e); }
  };

  // Flatten transparency to white background for email compatibility
  const flattenToWhiteBackground = (file) => {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Image processing timed out')), 10000);
      try {
        const reader = new FileReader();
        reader.onload = (e) => {
          const img = new Image();
          img.onload = () => {
            try {
              const isSvg = file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg');
              const scale = isSvg ? 4 : 1;
              const canvas = document.createElement('canvas');
              canvas.width = img.naturalWidth * scale;
              canvas.height = img.naturalHeight * scale;
              const ctx = canvas.getContext('2d');
              ctx.fillStyle = '#FFFFFF';
              ctx.fillRect(0, 0, canvas.width, canvas.height);
              ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
              canvas.toBlob((blob) => {
                clearTimeout(timeout);
                if (!blob) { reject(new Error('Canvas conversion failed')); return; }
                const outName = file.name.replace(/\.\w+$/, '.png');
                resolve(new File([blob], outName, { type: 'image/png' }));
              }, 'image/png');
            } catch (err) { clearTimeout(timeout); reject(err); }
          };
          img.onerror = () => { clearTimeout(timeout); reject(new Error('Failed to load image')); };
          img.src = e.target.result;
        };
        reader.onerror = () => { clearTimeout(timeout); reject(new Error('Failed to read file')); };
        reader.readAsDataURL(file);
      } catch (err) { clearTimeout(timeout); reject(err); }
    });
  };

  // Logo upload handler
  const handleLogoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!dbRef.current || !storageRef.current) { alert("Database not connected."); return; }

    if (file.size > 2000000) {
      alert("File too large. Max 2MB.");
      if (logoInputRef.current) logoInputRef.current.value = '';
      return;
    }

    // Flatten transparency to white background for email compatibility
    let uploadFile;
    try {
      uploadFile = await flattenToWhiteBackground(file);
    } catch (err) {
      console.error('Image processing failed:', err);
      uploadFile = file;
    }

    const logoName = newLogoName.trim() || `Logo ${new Date().toLocaleDateString()}`;
    setIsUploadingLogo(true);

    try {
      const fileExt = uploadFile.name.split('.').pop();
      const fileName = `logos/logo-${Date.now()}.${fileExt}`;
      const logoStorageRef = ref(storageRef.current, fileName);

      const snapshot = await uploadBytes(logoStorageRef, uploadFile);
      const downloadURL = await getDownloadURL(snapshot.ref);

      await addDoc(collection(dbRef.current, "logos"), {
        name: logoName,
        url: downloadURL,
        isDefault: false,
        uploadedAt: new Date().toISOString()
      });

      setTempLogoUrl(downloadURL);
      setNewLogoName('');
      alert("Logo uploaded successfully!");

    } catch (err) {
      console.error(err);
      alert("Upload failed: " + err.message);
    } finally {
      setIsUploadingLogo(false);
      if (logoInputRef.current) logoInputRef.current.value = '';
    }
  };

  const handleSelectLogo = (url) => setTempLogoUrl(url);

  const handleDeleteLogo = async (logoId, isDefault) => {
    if (isDefault) { alert("Cannot delete default logo."); return; }
    if (!window.confirm("Delete this logo?")) return;
    try { await deleteDoc(doc(dbRef.current, "logos", logoId)); } catch (e) { alert("Delete failed."); }
  };

  // Agent management handlers (unchanged)
  const handleAddAgent = async () => {
    if (!newAgentName || !newAgentEmail || !dbRef.current) return;
    setIsUploadingAgentPhoto(true);
    try {
      let finalPhotoUrl = newAgentPhoto || '';
      if (photoFile && storageRef.current) {
        const processedPhoto = await flattenToWhiteBackground(photoFile).catch(() => photoFile);
        const cleanName = newAgentName.toLowerCase().replace(/[^a-z0-9]/g, '-');
        const fileExt = processedPhoto.name.split('.').pop();
        const fileName = `${cleanName}-${Date.now()}.${fileExt}`;
        const imageRef = ref(storageRef.current, `agents/${fileName}`);

        const snapshot = await uploadBytes(imageRef, processedPhoto);
        finalPhotoUrl = await getDownloadURL(snapshot.ref);
      }
      const slug = newAgentSlug.trim() || generateSlugFromName(newAgentName);
      await addDoc(collection(dbRef.current, "agents"), {
        name: newAgentName,
        email: newAgentEmail,
        mobile: newAgentMobile,
        title: newAgentTitle,
        photo: finalPhotoUrl,
        slug,
        testAgent: newAgentTestAgent
      });
      setNewAgentName(''); setNewAgentEmail(''); setNewAgentMobile(''); setNewAgentTitle(''); setNewAgentPhoto(''); setNewAgentSlug(''); setPhotoFile(null); setNewAgentTestAgent(false);
      alert("Agent added successfully!");
    } catch (e) { console.error(e); alert("Add failed."); } finally { setIsUploadingAgentPhoto(false); }
  };

  const handleEditAgent = (agent) => {
    setEditingAgent(agent.id);
    setEditAgentName(agent.name);
    setEditAgentEmail(agent.email);
    setEditAgentMobile(agent.mobile || '');
    setEditAgentTitle(agent.title || '');
    setEditAgentPhoto(agent.photo || '');
    setEditAgentSlug(agent.slug || generateSlugFromName(agent.name));
    setEditAgentTestAgent(agent.testAgent || false);
    setEditPhotoFile(null);
  };

  const handleSaveAgent = async () => {
    if (!editingAgent || !dbRef.current) return;
    setIsUploadingAgentPhoto(true);
    try {
      let finalPhotoUrl = editAgentPhoto;
      if (editPhotoFile && storageRef.current) {
        const processedPhoto = await flattenToWhiteBackground(editPhotoFile).catch(() => editPhotoFile);
        const cleanName = editAgentName.toLowerCase().replace(/[^a-z0-9]/g, '-');
        const fileExt = processedPhoto.name.split('.').pop();
        const fileName = `${cleanName}-${Date.now()}.${fileExt}`;
        const imageRef = ref(storageRef.current, `agents/${fileName}`);

        const snapshot = await uploadBytes(imageRef, processedPhoto);
        finalPhotoUrl = await getDownloadURL(snapshot.ref);
      }
      await updateDoc(doc(dbRef.current, "agents", editingAgent), {
        name: editAgentName,
        email: editAgentEmail,
        mobile: editAgentMobile,
        title: editAgentTitle,
        photo: finalPhotoUrl,
        slug: editAgentSlug.trim() || generateSlugFromName(editAgentName),
        testAgent: editAgentTestAgent
      });
      setEditingAgent(null); setEditPhotoFile(null);
      alert("Agent updated!");
    } catch (e) { console.error(e); alert("Update failed."); } finally { setIsUploadingAgentPhoto(false); }
  };

  const handleCancelEdit = () => { setEditingAgent(null); setEditPhotoFile(null); };

  const handleDeleteAgent = async (id) => {
    if (!dbRef.current || !id) return;
    if (window.confirm("Remove Agent?")) await deleteDoc(doc(dbRef.current, "agents", id));
  };

  const generateSlugFromName = (name) => {
    const firstName = name.trim().split(' ')[0];
    const base = firstName.toLowerCase().replace(/[^a-z0-9]/g, '');
    const usedSlugs = agentsList.map(a => a.slug).filter(Boolean);
    let slug = base;
    let counter = 2;
    while (usedSlugs.includes(slug)) {
      slug = `${base}${counter}`;
      counter++;
    }
    return slug;
  };

  const toggleManualAddress = () => {
    if (!manualAddressEntry && autocompleteInstance.current) {
      window.google.maps.event.clearInstanceListeners(autocompleteInstance.current);
      autocompleteInstance.current = null;
    }
    setManualAddressEntry(prev => !prev);
  };

  const handleClearForm = () => {
    if (window.confirm("Clear all form data? This will reset the entire form.")) {
      setFormData({
        agentName: '',
        agentEmail: '',
        agentMobile: '',
        agentTitle: '',
        agentPhoto: '',
        propertyAddress: '',
        buyers: [{
          isEntity: false,
          firstName: '',
          middleName: '',
          surname: '',
          entityName: '',
          abn: '',
          acn: '',
          email: '',
          phone: '',
          address: '',
          signature: null,
          signatureDate: new Date().toISOString().split('T')[0]
        }],
        solicitorCompany: '',
        solicitorContact: '',
        solicitorEmail: '',
        solicitorPhone: '',
        solicitorToBeAdvised: false,
        purchasePrice: '',
        initialDeposit: '',
        balanceDeposit: '',
        balanceDepositTerms: '',
        financeDate: '',
        financePreApproved: false,
        waiverCoolingOff: false,
        inspectionDate: '',
        settlementDate: '',
        specialConditions: ''
      });
      setFieldErrors({});
      setActiveBuyerTab(0);
      clearDraft();
      
      // Clear signature canvases if they exist
      const canvases = document.querySelectorAll('canvas');
      canvases.forEach(canvas => {
        const ctx = canvas.getContext('2d');
        if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
      });
    }
  };

  const handleNewAgentPhotoUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 800000) { alert("Photo too large. Max 800KB."); return; }
    setPhotoFile(file);
    const reader = new FileReader();
    reader.onload = () => { setNewAgentPhoto(reader.result); if (newAgentPhotoInputRef.current) newAgentPhotoInputRef.current.value = ''; };
    reader.readAsDataURL(file);
  };

  const handleEditAgentPhotoUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 800000) { alert("Photo too large. Max 800KB."); return; }
    setEditPhotoFile(file);
    const reader = new FileReader();
    reader.onload = () => { setEditAgentPhoto(reader.result); if (editAgentPhotoInputRef.current) editAgentPhotoInputRef.current.value = ''; };
    reader.readAsDataURL(file);
  };

  const getDepositPlaceholder = () => {
    if (placeholders.depositAmount) return placeholders.depositAmount;
    if (placeholders.depositPercent) {
      if (formData.purchasePrice) {
        const calc = calculateDeposit(formData.purchasePrice, placeholders.depositPercent);
        if (calc) return `${calc} (${placeholders.depositPercent}% of purchase price)`;
      }
      return `Enter purchase price to calculate ${placeholders.depositPercent}%`;
    }
    return '';
  };

  const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=500x500&data=${encodeURIComponent(shortLink || 'https://example.com')}&ecc=L&margin=2&format=png`;

  const downloadQr = async () => {
    try {
      const res = await fetch(qrApiUrl);
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const qrLabel = agentModeData.propertyAddress || agentModeData.agentName.split(' ')[0];
      link.download = `QR_${qrLabel.replace(/[^a-z0-9]/gi, '_').substring(0, 15)}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (e) { window.open(qrApiUrl, '_blank'); }
  };

  const hasSecondBuyer = formData.buyerName2 && formData.buyerName2.trim().length > 0;
  const selectedAgent = agentsList.find(a => a.name === formData.agentName);

  // ==============================================================================
  // RENDER
  // ==============================================================================

  // Filter test agents from buyer-facing dropdown (visible in dev mode or admin)
  const visibleAgents = agentsList.filter(a => !a.testAgent || isDevMode);

  return (
    <div className="min-h-screen bg-stone-50 print:bg-white text-slate-800 font-inter relative">
      <style>{`
        .pac-container { z-index: 10000 !important; }
        @keyframes highlight {
          0% { background-color: transparent; }
          50% { background-color: #fef3cd; }
          100% { background-color: transparent; }
        }
        .smart-calc {
          animation: highlight 1s ease-in-out;
        }
      `}</style>

      {/* Desktop Floating Progress Sidebar */}
      <DesktopProgressSidebar formData={formData} features={features} />

      {/* Auto-save Indicator */}
      <AutoSaveIndicator show={showAutoSave} />

      {/* Navigation bar — hidden only for property-specific QR forms */}
      {!propertyId && (
        <nav className="hidden sm:block bg-slate-900 text-white p-3 sm:p-4 sticky top-0 z-50 shadow-md print:hidden">
          <div className="max-w-5xl mx-auto flex justify-between items-center">
            <div className="flex items-center gap-2">
              {logoUrl && <img src={logoUrl} alt="Logo" className="h-6 sm:h-8 w-auto bg-white p-1 rounded" />}
              <span className="font-bold tracking-tight ml-2 hidden sm:inline">Offer Form</span>
            </div>
            {!isAgentPrefilled && (
              <div className="flex gap-1 sm:gap-2">
                <button type="button" onClick={openAdminPanel} className="flex items-center gap-1.5 px-2 sm:px-3 py-1.5 sm:py-2 bg-red-600 hover:bg-red-700 rounded transition text-xs sm:text-sm font-bold">
                  <Lock className="w-3 h-3 sm:w-4 sm:h-4" />
                  <span className="hidden sm:inline">Admin</span>
                </button>
                <button type="button" onClick={handleClearForm} className="flex items-center gap-1.5 px-2 sm:px-3 py-1.5 sm:py-2 bg-amber-600 hover:bg-amber-700 text-white rounded transition font-medium text-xs sm:text-sm">
                  <RotateCcw className="w-3 sm:w-4 h-3 sm:h-4" />
                  <span className="hidden sm:inline">Clear</span>
                </button>
                <button type="button" onClick={handlePrint} className="flex items-center gap-1.5 px-2 sm:px-3 py-1.5 sm:py-2 bg-slate-700 hover:bg-slate-600 rounded transition font-medium text-xs sm:text-sm">
                  <Printer className="w-3 sm:w-4 h-3 sm:h-4" />
                  <span className="hidden sm:inline">Print</span>
                </button>
              </div>
            )}
          </div>
        </nav>
      )}

      {/* Mobile Progress Bar - only visible on mobile */}
      <MobileProgressBar formData={formData} isQRForm={!!propertyId} />

      {/* LOGIN MODAL */}
      {showLoginModal && (
        <div className="fixed inset-0 z-[70] bg-slate-900/90 backdrop-blur-sm flex items-center justify-center p-4 print:hidden">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden">
            <div className="bg-slate-900 p-4 flex justify-between items-center">
              <h2 className="text-white font-bold text-lg flex items-center gap-2">
                <Lock className="w-5 h-5 text-red-500" /> Admin Login
              </h2>
              <button onClick={() => setShowLoginModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              {loginError && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" /> {loginError}
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                <input
                  type="email"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none"
                  placeholder="admin@prddapto.com.au"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Password</label>
                <input
                  type="password"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none"
                  placeholder="Enter password"
                />
              </div>
              <button
                onClick={handleLogin}
                disabled={loginLoading}
                className="w-full bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white font-bold py-2.5 rounded-lg transition flex items-center justify-center gap-2"
              >
                {loginLoading ? <Loader className="w-4 h-4 animate-spin" /> : <Lock className="w-4 h-4" />}
                {loginLoading ? 'Signing in...' : 'Sign In'}
              </button>
              <button
                type="button"
                onClick={handleForgotPassword}
                className="w-full text-sm text-slate-500 hover:text-red-600 transition mt-1"
              >
                Forgot password?
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ADMIN PANEL */}
      {showAdminPanel && (
        <div className="fixed inset-0 z-[60] bg-slate-900/90 backdrop-blur-sm flex items-center justify-center p-4 print:hidden">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="bg-slate-900 p-4 flex justify-between items-center shrink-0">
              <h2 className="text-white font-bold text-lg flex items-center gap-2">
                <Lock className="w-5 h-5 text-red-500" /> Admin Panel
              </h2>
              <div className="flex items-center gap-3">
                {adminUser && (
                  <>
                    <span className="text-slate-400 text-xs hidden sm:inline">{adminUser.email}</span>
                    <button onClick={handleLogout} className="text-slate-400 hover:text-red-400 transition flex items-center gap-1" title="Sign Out">
                      <LogOut className="w-4 h-4" />
                    </button>
                  </>
                )}
                <button onClick={() => { setShowAdminPanel(false); setEditingAgent(null); }} className="text-slate-400 hover:text-white">
                  <X className="w-6 h-6" />
                </button>
              </div>
            </div>
            
            <div className="bg-slate-100 border-b border-slate-200 flex shrink-0">
              <button onClick={() => setAdminTab('qr')} className={`flex-1 px-4 py-3 text-sm font-bold flex items-center justify-center gap-2 transition ${adminTab === 'qr' ? 'bg-white text-red-600 border-b-2 border-red-600' : 'text-slate-500 hover:text-slate-700'}`}>
                <QrCode className="w-4 h-4" /> QR Generator
              </button>
              <button onClick={() => setAdminTab('settings')} className={`flex-1 px-4 py-3 text-sm font-bold flex items-center justify-center gap-2 transition ${adminTab === 'settings' ? 'bg-white text-red-600 border-b-2 border-red-600' : 'text-slate-500 hover:text-slate-700'}`}>
                <Database className="w-4 h-4" /> Defaults
              </button>
              <button onClick={() => setAdminTab('team')} className={`flex-1 px-4 py-3 text-sm font-bold flex items-center justify-center gap-2 transition ${adminTab === 'team' ? 'bg-white text-red-600 border-b-2 border-red-600' : 'text-slate-500 hover:text-slate-700'}`}>
                <Users className="w-4 h-4" /> Team
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1">
              {/* QR TAB */}
              {adminTab === 'qr' && (
                <div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div className="space-y-4">
                    <p className="text-sm text-slate-600">Generate a QR code for an agent. Add an address for a property-specific code, or leave blank for an agent-only link buyers can use anywhere.</p>
                    <div>
                      <label className="text-xs font-bold text-slate-500 uppercase block mb-1">Agent <span className="text-red-500">*</span></label>
                      <select className="w-full border border-slate-300 rounded p-2 text-sm" value={agentModeData.agentName} onChange={(e) => { setAgentModeData(p => ({ ...p, agentName: e.target.value })); setQrGenerated(false); }}>
                        <option value="">-- Select --</option>
                        {agentsList.filter(a => !a.testAgent || isDevMode).map(a => (<option key={a.id || a.name} value={a.name}>{a.name}{a.slug ? ` (/${a.slug})` : ''}</option>))}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-bold text-slate-500 uppercase block mb-1 flex items-center gap-1">
                        Address <span className="text-slate-400 font-normal normal-case">(optional)</span> {agentModeReady && <MapPin className="w-3 h-3 text-green-500" />}
                      </label>
                      <input ref={agentAddressInputRef} type="text" className="w-full border border-slate-300 rounded p-2 text-sm" placeholder={agentModeReady ? "Start typing address... (leave blank for agent-only)" : "Loading..."} value={agentModeData.propertyAddress} onChange={(e) => { setAgentModeData(p => ({ ...p, propertyAddress: e.target.value })); setQrGenerated(false); }} />
                    </div>

                    {/* Collapsible Customise Form section */}
                    <div className="border border-slate-200 rounded-lg overflow-hidden">
                      <button onClick={() => setQrCustomiseOpen(!qrCustomiseOpen)} className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 transition text-left">
                        <span className="text-sm font-bold text-slate-700 flex items-center gap-2"><Settings className="w-4 h-4" /> Customise Form</span>
                        <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${qrCustomiseOpen ? 'rotate-180' : ''}`} />
                      </button>
                      {qrCustomiseOpen && (
                        <div className="p-4 space-y-5 border-t border-slate-200">
                          <p className="text-xs text-slate-500">Override global defaults for this property. Leave fields empty to use global defaults.</p>

                          {/* Placeholder Fields */}
                          <div>
                            <h4 className="text-xs font-bold text-slate-600 mb-2 flex items-center gap-1"><Type className="w-3 h-3" /> Form Placeholders</h4>
                            <PlaceholderFields values={qrPlaceholders} onChange={setQrPlaceholders} />
                          </div>
                        </div>
                      )}
                    </div>

                    <button onClick={generateSmartLink} disabled={!agentModeData.agentName || isGeneratingLink} className="w-full bg-red-600 hover:bg-red-700 disabled:bg-slate-300 text-white py-3 rounded text-sm font-bold mt-2 flex items-center justify-center gap-2">
                      {isGeneratingLink ? <Loader className="w-4 h-4 animate-spin" /> : <><QrCode className="w-4 h-4" /> Generate QR</>}
                    </button>
                  </div>
                  <div className="bg-slate-50 border border-slate-200 rounded-lg flex flex-col items-center justify-center p-4 min-h-[300px]">
                    {qrGenerated ? (
                      <div className="flex flex-col items-center w-full">
                        <div className="bg-white p-2 rounded shadow mb-3 border border-slate-100">
                          <img src={qrApiUrl} alt="QR" className="w-40 h-40" />
                        </div>
                        <div className="text-xs font-mono text-slate-500 bg-white border rounded px-2 py-1 mb-3 w-full truncate text-center">{shortLink}</div>
                        <div className="flex gap-2 w-full">
                          <button onClick={() => { navigator.clipboard.writeText(shortLink); alert("Copied!"); }} className="flex-1 bg-white border hover:bg-slate-50 py-2 rounded text-xs font-bold flex items-center justify-center gap-1"><Copy className="w-3 h-3" /> Copy URL</button>
                          <button onClick={downloadQr} className="flex-1 bg-white border hover:bg-slate-50 py-2 rounded text-xs font-bold flex items-center justify-center gap-1"><Download className="w-3 h-3" /> Save QR Image</button>
                        </div>
                        <a href={shortLink} target="_blank" rel="noreferrer" className="w-full mt-2 bg-slate-900 text-white py-2 rounded text-xs font-bold flex items-center justify-center gap-1 hover:bg-black"><ExternalLink className="w-3 h-3" /> Open Form</a>
                      </div>
                    ) : (
                      <div className="text-slate-400 text-center">
                        <QrCode className="w-12 h-12 mx-auto mb-2 opacity-20" />
                        <p className="text-xs">Select an Agent<br />to generate code.</p>
                      </div>
                    )}
                  </div>
                </div>
                </div>
              )}

              {/* DEFAULTS TAB */}
              {adminTab === 'settings' && (
                <div className="space-y-6">
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <p className="text-sm text-blue-800">These are the <strong>global defaults</strong> used when no per-property customisation is set. You can override these for individual properties in the <strong>QR Generator</strong> tab.</p>
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-700 mb-2 flex items-center gap-2"><ImageIcon className="w-4 h-4" /> Default Logo</h3>
                    <div className="flex items-start gap-4 mb-4">
                      <div className="w-32 h-16 bg-slate-100 border-2 border-red-500 rounded flex items-center justify-center p-2">
                        {tempLogoUrl && <img src={tempLogoUrl || defaultLogoUrl} alt="Current Logo" className="max-h-full max-w-full object-contain" />}
                      </div>
                      <div className="flex-1">
                        <p className="text-xs font-bold text-slate-700 mb-1">Currently Selected</p>
                        <p className="text-xs text-slate-500">Click a logo below to select it, then Save.</p>
                      </div>
                    </div>
                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 mb-4">
                      <p className="text-xs font-bold text-slate-600 mb-2">Available Logos</p>
                      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2 max-h-40 overflow-y-auto">
                        {logoGallery.map((logo) => (
                          <div key={logo.id} className={`relative group cursor-pointer rounded border-2 p-1 transition-all ${tempLogoUrl === logo.url ? 'border-red-500 bg-red-50' : 'border-slate-200 hover:border-slate-400 bg-white'}`} onClick={() => handleSelectLogo(logo.url)}>
                            <div className="h-10 flex items-center justify-center">
                              <img src={logo.url} alt={logo.name} className="max-h-full max-w-full object-contain" />
                            </div>
                            <p className="text-[10px] text-slate-500 truncate text-center mt-1">{logo.name}</p>
                            {tempLogoUrl === logo.url && (
                              <div className="absolute -top-1 -right-1 bg-red-500 rounded-full p-0.5">
                                <Check className="w-2 h-2 text-white" />
                              </div>
                            )}
                            {!logo.isDefault && (
                              <button onClick={(e) => { e.stopPropagation(); handleDeleteLogo(logo.id, logo.isDefault); }} className="absolute -top-1 -left-1 bg-white border border-slate-300 rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-50 hover:border-red-300">
                                <X className="w-2 h-2 text-red-500" />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                      <p className="text-xs font-bold text-blue-700 mb-2 flex items-center gap-1"><Plus className="w-3 h-3" /> Upload New Logo</p>
                      <div className="flex gap-2 items-end">
                        <div className="flex-1">
                          <label className="text-xs text-slate-500 block mb-1">Logo Name</label>
                          <input type="text" value={newLogoName} onChange={(e) => setNewLogoName(e.target.value)} className="w-full border border-slate-300 rounded p-1.5 text-sm" placeholder="e.g. Christmas, Easter" />
                        </div>
                        <div>
                          <input type="file" ref={logoInputRef} onChange={handleLogoUpload} accept="image/*" className="hidden" />
                          <button onClick={() => logoInputRef.current?.click()} disabled={isUploadingLogo} className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-bold">
                            {isUploadingLogo ? <Loader className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />} Upload
                          </button>
                        </div>
                      </div>
                      <p className="text-[10px] text-blue-500 mt-1.5">Recommended: PNG or JPG, at least 500px wide. Max 2MB. SVGs auto-converted to PNG.</p>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-sm font-bold text-slate-700 mb-2 flex items-center gap-2"><Type className="w-4 h-4" /> Default Placeholders</h3>
                    <p className="text-xs text-slate-500 mb-3">These values pre-fill the form fields for buyers. Leave empty for no placeholder.</p>
                    <PlaceholderFields values={tempPlaceholders} onChange={setTempPlaceholders} />
                  </div>

                  <div>
                    <h3 className="text-sm font-bold text-slate-700 mb-2 flex items-center gap-2"><Settings className="w-4 h-4" /> Form Sections</h3>
                    <p className="text-xs text-slate-500 mb-3">Toggle which optional sections are visible on the buyer form.</p>
                    <div className="space-y-3">
                      <label className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-100 transition-colors">
                        <div>
                          <span className="text-sm font-medium text-slate-700">Show Deposit Details</span>
                          <p className="text-xs text-slate-500">Initial + Balance Deposit fields and calculations</p>
                        </div>
                        <div className="relative">
                          <input type="checkbox" checked={tempFeatures.showDeposits} onChange={(e) => setTempFeatures(f => ({ ...f, showDeposits: e.target.checked }))} className="sr-only peer" />
                          <div className="w-10 h-5 bg-slate-300 peer-checked:bg-blue-600 rounded-full transition-colors"></div>
                          <div className="absolute left-0.5 top-0.5 w-4 h-4 bg-white rounded-full shadow peer-checked:translate-x-5 transition-transform"></div>
                        </div>
                      </label>
                      <label className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-100 transition-colors">
                        <div>
                          <span className="text-sm font-medium text-slate-700">Show Finance</span>
                          <p className="text-xs text-slate-500">Finance Date and Loan Pre-Approved fields</p>
                        </div>
                        <div className="relative">
                          <input type="checkbox" checked={tempFeatures.showFinance} onChange={(e) => setTempFeatures(f => ({ ...f, showFinance: e.target.checked }))} className="sr-only peer" />
                          <div className="w-10 h-5 bg-slate-300 peer-checked:bg-blue-600 rounded-full transition-colors"></div>
                          <div className="absolute left-0.5 top-0.5 w-4 h-4 bg-white rounded-full shadow peer-checked:translate-x-5 transition-transform"></div>
                        </div>
                      </label>
                      <label className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-100 transition-colors">
                        <div>
                          <span className="text-sm font-medium text-slate-700">Show Building & Pest</span>
                          <p className="text-xs text-slate-500">Building & Pest inspection date field</p>
                        </div>
                        <div className="relative">
                          <input type="checkbox" checked={tempFeatures.showBuildingPest} onChange={(e) => setTempFeatures(f => ({ ...f, showBuildingPest: e.target.checked }))} className="sr-only peer" />
                          <div className="w-10 h-5 bg-slate-300 peer-checked:bg-blue-600 rounded-full transition-colors"></div>
                          <div className="absolute left-0.5 top-0.5 w-4 h-4 bg-white rounded-full shadow peer-checked:translate-x-5 transition-transform"></div>
                        </div>
                      </label>
                    </div>
                  </div>

                  <button onClick={handleSaveSettings} className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded text-sm font-bold">Save Defaults</button>
                </div>
              )}

              {/* TEAM TAB (unchanged) */}
              {adminTab === 'team' && (
                <div className="space-y-4">
                  <p className="text-sm text-slate-600">Manage your team members. Added fields will appear in the webhook data.</p>
                  <div className="border border-slate-200 rounded-lg overflow-hidden">
                    <div className="max-h-80 overflow-y-auto">
                      {agentsList.filter(a => !a.testAgent || isDevMode).map((a, i) => (
                        <div key={a.id || i} className="border-b border-slate-100 last:border-b-0">
                          {editingAgent === a.id ? (
                            <div className="p-3 bg-blue-50 space-y-2">
                              <div className="flex items-center gap-2">
                                {editAgentPhoto ? (<img src={editAgentPhoto} alt="Preview" className="w-10 h-10 rounded-full object-cover" />) : (<div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center text-slate-400"><User className="w-5 h-5" /></div>)}
                                <input type="text" value={editAgentName} onChange={(e) => setEditAgentName(e.target.value)} className="flex-1 border border-slate-300 rounded p-1.5 text-sm" placeholder="Name" />
                              </div>
                              <div className="grid grid-cols-2 gap-2">
                                <input type="email" value={editAgentEmail} onChange={(e) => setEditAgentEmail(e.target.value)} className="w-full border border-slate-300 rounded p-1.5 text-sm" placeholder="Email" />
                                <input type="tel" value={editAgentMobile} onChange={(e) => setEditAgentMobile(e.target.value)} className="w-full border border-slate-300 rounded p-1.5 text-sm" placeholder="Mobile" />
                              </div>
                              <input type="text" value={editAgentTitle} onChange={(e) => setEditAgentTitle(e.target.value)} className="w-full border border-slate-300 rounded p-1.5 text-sm" placeholder="Job Title (e.g. Sales Associate)" />
                              <div className="flex items-center gap-1">
                                <span className="text-xs text-slate-400 shrink-0">dapto.prdoffer.com/</span>
                                <input type="text" value={editAgentSlug} onChange={(e) => setEditAgentSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ''))} className="flex-1 border border-slate-300 rounded p-1.5 text-sm" placeholder="slug" />
                              </div>

                              <div className="space-y-1">
                                <input 
                                  type="file" 
                                  ref={editAgentPhotoInputRef}
                                  onChange={handleEditAgentPhotoUpload}
                                  accept="image/*"
                                  className="hidden"
                                />
                                <button 
                                  onClick={() => editAgentPhotoInputRef.current?.click()}
                                  disabled={isUploadingAgentPhoto}
                                  className="w-full bg-slate-100 hover:bg-slate-200 disabled:bg-slate-50 text-slate-700 py-1.5 rounded text-xs font-medium flex items-center justify-center gap-1"
                                >
                                  <Upload className="w-3 h-3" />
                                  {isUploadingAgentPhoto ? 'Uploading...' : 'Change Photo'}
                                </button>
                              </div>
                              {isDevMode && (
                                <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
                                  <input type="checkbox" checked={editAgentTestAgent} onChange={(e) => setEditAgentTestAgent(e.target.checked)} className="rounded border-slate-300" />
                                  Test Agent
                                </label>
                              )}
                              <div className="flex gap-2">
                                <button onClick={handleSaveAgent} className="flex-1 bg-green-600 hover:bg-green-700 text-white py-1.5 rounded text-xs font-bold flex items-center justify-center gap-1"><Check className="w-3 h-3" /> Save</button>
                                <button onClick={handleCancelEdit} className="flex-1 bg-slate-300 hover:bg-slate-400 text-slate-700 py-1.5 rounded text-xs font-bold flex items-center justify-center gap-1"><X className="w-3 h-3" /> Cancel</button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center gap-3 p-3 hover:bg-slate-50">
                              {a.photo ? (<img src={a.photo} alt={a.name} className="w-10 h-10 rounded-full object-cover" />) : (<div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center text-slate-400"><User className="w-5 h-5" /></div>)}
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-bold text-slate-800 truncate">{a.name} {a.testAgent && <span className="text-xs font-normal text-orange-500 ml-1">(Test)</span>}</div>
                                <div className="text-xs text-slate-500 truncate">{a.title || 'Agent'}{a.slug && <span className="ml-2 text-slate-400">/{a.slug}</span>}</div>
                              </div>
                              {a.id && (
                                <div className="flex gap-1">
                                  <button onClick={() => handleEditAgent(a)} className="text-slate-400 hover:text-blue-600 p-1" title="Edit"><Edit2 className="w-4 h-4" /></button>
                                  <button onClick={() => handleDeleteAgent(a.id)} className="text-slate-400 hover:text-red-500 p-1" title="Delete"><Trash2 className="w-4 h-4" /></button>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                  
                  {/* ADD NEW AGENT FORM */}
                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
                    <h4 className="text-sm font-bold text-slate-700 mb-3">Add New Agent</h4>
                    <div className="space-y-3">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <input type="text" placeholder="Full Name *" value={newAgentName} onChange={(e) => setNewAgentName(e.target.value)} className="border border-slate-300 rounded p-2 text-sm" />
                        <input type="email" placeholder="Email *" value={newAgentEmail} onChange={(e) => setNewAgentEmail(e.target.value)} className="border border-slate-300 rounded p-2 text-sm" />
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <input type="tel" placeholder="Mobile Number" value={newAgentMobile} onChange={(e) => setNewAgentMobile(e.target.value)} className="border border-slate-300 rounded p-2 text-sm" />
                        <input type="text" placeholder="Job Title (e.g. Director)" value={newAgentTitle} onChange={(e) => setNewAgentTitle(e.target.value)} className="border border-slate-300 rounded p-2 text-sm" />
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-slate-400 shrink-0">dapto.prdoffer.com/</span>
                        <input type="text" placeholder={newAgentName ? generateSlugFromName(newAgentName) : 'auto-generated'} value={newAgentSlug} onChange={(e) => setNewAgentSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ''))} className="flex-1 border border-slate-300 rounded p-2 text-sm" />
                      </div>
                      <div className="flex items-center gap-2">
                        <input 
                          type="file" 
                          ref={newAgentPhotoInputRef}
                          onChange={handleNewAgentPhotoUpload}
                          accept="image/*"
                          className="hidden"
                        />
                        {newAgentPhoto && (
                          <img src={newAgentPhoto} alt="Preview" className="w-10 h-10 rounded-full object-cover" />
                        )}
                        <button 
                          onClick={() => newAgentPhotoInputRef.current?.click()}
                          disabled={isUploadingAgentPhoto}
                          className="flex-1 bg-slate-100 hover:bg-slate-200 disabled:bg-slate-50 text-slate-700 py-2 rounded text-sm font-medium flex items-center justify-center gap-2"
                        >
                          <Upload className="w-4 h-4" />
                          {isUploadingAgentPhoto ? 'Uploading...' : newAgentPhoto ? 'Change Photo' : 'Upload Photo (Optional)'}
                        </button>
                      </div>
                      {isDevMode && (
                        <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
                          <input type="checkbox" checked={newAgentTestAgent} onChange={(e) => setNewAgentTestAgent(e.target.checked)} className="rounded border-slate-300" />
                          Test Agent <span className="text-xs text-slate-400">(hidden from buyers, for dev testing only)</span>
                        </label>
                      )}
                      <button onClick={handleAddAgent} disabled={!newAgentName || !newAgentEmail} className="w-full bg-green-600 hover:bg-green-700 disabled:bg-slate-300 text-white px-4 py-2 rounded text-sm font-bold flex items-center justify-center gap-2"><Plus className="w-4 h-4" /> Add Agent</button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MAIN FORM */}
      <div ref={formContainerRef} className="max-w-4xl mx-auto bg-white shadow-xl print:shadow-none min-h-screen lg:ml-56">
        <header className="p-4 sm:p-8 pb-3 sm:pb-4 border-b border-slate-100 flex justify-between items-center print:p-0 print:mb-8">
          {/* LEFT COLUMN: Logo & Agent Info */}
          <div className="flex flex-col gap-2 sm:gap-3 min-w-0 flex-1">
            <div className="flex-shrink-0">
              {logoUrl && (
                <img
                  src={logoUrl}
                  alt="Logo"
                  className="h-auto max-w-[200px] sm:max-w-[260px] md:max-w-[320px] max-h-14 sm:max-h-20 object-contain"
                />
              )}
            </div>

            {/* AGENT PROFILE */}
            {formData.agentName && (
              <div className="flex items-center gap-2 sm:gap-3">
                {selectedAgent?.photo ? (
                  <img src={selectedAgent.photo} alt={formData.agentName} className="w-8 h-8 sm:w-12 sm:h-12 rounded-full object-cover ring-1 ring-slate-200" />
                ) : (
                  <div className="w-8 h-8 sm:w-12 sm:h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
                    <User className="w-4 h-4 sm:w-6 sm:h-6" />
                  </div>
                )}
                <div>
                  <p className="text-xs sm:text-sm font-bold text-slate-800 leading-tight">{formData.agentName}</p>
                  {selectedAgent?.title && <p className="text-xs text-slate-500">{selectedAgent.title}</p>}
                </div>
              </div>
            )}
          </div>

          {/* RIGHT COLUMN: Document Title */}
          <div className="text-right shrink-0 ml-4">
            <h2 className="text-base sm:text-xl font-semibold text-slate-900 whitespace-nowrap">Offer to Purchase</h2>
          </div>
        </header>

        {Object.keys(fieldErrors).length > 0 && (
          <div className="mx-4 sm:mx-8 mt-4 sm:mt-6 p-3 sm:p-4 bg-red-50 border border-red-200 rounded-lg print:hidden">
            <div className="flex items-start gap-2 sm:gap-3">
              <div className="bg-red-100 p-1.5 sm:p-2 rounded-full text-red-600"><AlertCircle className="w-4 h-4 sm:w-5 sm:h-5" /></div>
              <div>
                <h3 className="font-bold text-red-800 text-sm sm:text-base">Please complete the following required fields:</h3>
                <ul className="text-xs sm:text-sm text-red-700 mt-1 sm:mt-2 list-disc list-inside">
                  {Object.values(fieldErrors).map((error, i) => (<li key={i}>{error}</li>))}
                </ul>
              </div>
            </div>
          </div>
        )}

        {submitStatus === 'success' && (
          <div className="mx-4 sm:mx-8 mt-4 sm:mt-6 p-3 sm:p-4 bg-green-50 border border-green-200 rounded-lg flex items-start gap-2 sm:gap-3 print:hidden">
            <div className="bg-green-100 p-1.5 sm:p-2 rounded-full text-green-600"><Check className="w-4 h-4 sm:w-5 sm:h-5" /></div>
            <div>
              <h3 className="font-bold text-green-800 text-sm sm:text-base">Offer Submitted Successfully!</h3>
              <p className="text-xs sm:text-sm text-green-700 mt-1">Your offer has been sent to the agent and a copy has been emailed to you.</p>
              <div className="flex gap-3 mt-2">
                <button type="button" onClick={() => window.print()} className="text-xs font-bold text-green-800 hover:text-green-900 underline flex items-center gap-1"><Printer className="w-3 h-3" /> Print a Copy</button>
                {!isAgentPrefilled && (<button type="button" onClick={() => window.location.reload()} className="text-xs font-bold text-green-800 hover:text-green-900 underline">Create New Offer</button>)}
              </div>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-4 sm:p-8 pt-3 sm:pt-4 print:p-0">
          {!isAgentPrefilled && (
            <div id="section-agent" className={`bg-slate-50 p-4 rounded border mb-6 print:hidden scroll-mt-24 lg:scroll-mt-8 ${fieldErrors.agentName ? 'border-red-500 bg-red-50' : 'border-slate-200'}`}>
              <label className="text-xs font-bold text-slate-500 uppercase mb-2 flex items-center gap-2">
                <Users className="w-4 h-4" /> SELECT SELLING AGENT <span className="text-red-500">*</span>
              </label>
              <select 
                className={`w-full border rounded p-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-600 ${fieldErrors.agentName ? 'border-red-500' : 'border-slate-300'}`} 
                onChange={handleAgentChange} 
                value={formData.agentName}
              >
                <option value="">-- Please Select Agent --</option>
                {visibleAgents.map((a, i) => (<option key={a.id || i} value={a.name}>{a.name}</option>))}
              </select>
            </div>
          )}

          <SectionHeader icon={Building} title="Property Details" id="property" />
          {manualAddressEntry ? (
            <InputField key="manual" label="Property Address" name="propertyAddress" value={formData.propertyAddress} onChange={handleChange} placeholder="e.g. 4D/238 The Esplanade, Woonona" className="w-full" required readOnly={isAddressPrefilled} error={!!fieldErrors.propertyAddress} />
          ) : (
            <InputField key="search" label="Property Address" name="propertyAddress" value={formData.propertyAddress} onChange={handleChange} placeholder={isMapsLoaded && !mapsError ? "Start typing address..." : "e.g. 4D/238 The Esplanade"} className="w-full" required readOnly={isAddressPrefilled} inputRef={addressInputRef} icon={isMapsLoaded && !mapsError ? MapPin : null} error={!!fieldErrors.propertyAddress} />
          )}
          {!isAddressPrefilled && isMapsLoaded && !mapsError && (
            <button type="button" onClick={toggleManualAddress} className="text-xs text-slate-400 hover:text-red-600 mt-1 underline print:hidden">
              {manualAddressEntry ? "Use address search instead" : "Can't find your address? Enter manually"}
            </button>
          )}


{/* NEW BUYER SECTION WITH TABS */}
<div className="border-b border-slate-300 pb-2 mb-5 mt-10 flex items-center justify-between scroll-mt-24 lg:scroll-mt-8" id="section-buyer">
  <div className="flex items-center gap-2">
    <User className="w-4 h-4 text-red-600" />
    <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Buyer Details</h2>
  </div>
  <button type="button" onClick={addBuyer} className="print:hidden flex items-center gap-1 px-3 py-1 bg-green-600 hover:bg-green-700 text-white rounded text-sm font-bold">
    <Plus className="w-4 h-4" /> Add Buyer
  </button>
</div>

{/* Buyer Tabs */}
<div className="print:hidden mb-4 flex gap-2 overflow-x-auto">
  {formData.buyers.map((_, index) => (
    <button
      key={index}
      type="button"
      onClick={() => setActiveBuyerTab(index)}
      className={`px-4 py-2 rounded-full text-xs font-semibold whitespace-nowrap transition-colors ${
        activeBuyerTab === index
          ? 'bg-slate-800 text-white shadow-sm'
          : 'bg-white text-slate-500 border border-slate-200 hover:border-slate-300'
      }`}
    >
      Buyer {index + 1}
    </button>
  ))}
</div>

{/* Buyer Content */}
{formData.buyers.map((buyer, buyerIndex) => (
  <div
    key={buyerIndex}
    className={`${buyerIndex === activeBuyerTab ? 'block' : 'hidden'} print:block bg-slate-50 p-6 rounded border border-slate-200 mb-6`}
  >
    {/* Entity Toggle */}
    <div className="mb-6 p-4 bg-white rounded border border-slate-300">
      <label className="flex items-center gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={buyer.isEntity}
          onChange={() => handleEntityToggle(buyerIndex)}
          className="w-5 h-5 text-red-600"
        />
        <span className="text-sm font-bold text-slate-700">Buying as Entity (Company/Trust)?</span>
      </label>
    </div>

    {/* Individual Fields */}
    {!buyer.isEntity && (
      <div className="space-y-4">
        <h3 className="text-sm font-bold text-slate-700 border-b border-slate-300 pb-2 mb-4">Individual Details</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <InputField
            label="First Name"
            name={`buyer${buyerIndex}_firstName`}
            value={buyer.firstName}
            onChange={(e) => handleBuyerChange(buyerIndex, 'firstName', e.target.value)}
            required
            error={!!fieldErrors[`buyer${buyerIndex}_firstName`]}
          />
          <InputField
            label="Middle Name"
            name={`buyer${buyerIndex}_middleName`}
            value={buyer.middleName}
            onChange={(e) => handleBuyerChange(buyerIndex, 'middleName', e.target.value)}
          />
          <InputField
            label="Surname"
            name={`buyer${buyerIndex}_surname`}
            value={buyer.surname}
            onChange={(e) => handleBuyerChange(buyerIndex, 'surname', e.target.value)}
            required
            error={!!fieldErrors[`buyer${buyerIndex}_surname`]}
          />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <InputField
            label="Email"
            name={`buyer${buyerIndex}_email`}
            type="email"
            value={buyer.email}
            onChange={(e) => handleBuyerChange(buyerIndex, 'email', e.target.value)}
            required
            error={!!fieldErrors[`buyer${buyerIndex}_email`]}
          />
          <InputField
            label="Phone"
            name={`buyer${buyerIndex}_phone`}
            type="tel"
            value={buyer.phone}
            onChange={(e) => handleBuyerChange(buyerIndex, 'phone', e.target.value)}
            required
            error={!!fieldErrors[`buyer${buyerIndex}_phone`]}
          />
        </div>
        <InputField
          label="Current Address"
          name={`buyer${buyerIndex}_address`}
          value={buyer.address}
          onChange={(e) => handleBuyerChange(buyerIndex, 'address', e.target.value)}
          required
          error={!!fieldErrors[`buyer${buyerIndex}_address`]}
        />
      </div>
    )}

    {/* Entity Fields */}
    {buyer.isEntity && (
      <div className="space-y-4">
        <h3 className="text-sm font-bold text-slate-700 border-b border-slate-300 pb-2 mb-4">Entity Details</h3>
        <InputField
          label="Entity Name"
          name={`buyer${buyerIndex}_entityName`}
          value={buyer.entityName}
          onChange={(e) => handleBuyerChange(buyerIndex, 'entityName', e.target.value)}
          placeholder="e.g. Smith Family Trust"
          required
          error={!!fieldErrors[`buyer${buyerIndex}_entityName`]}
        />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <InputField
            label="ABN"
            name={`buyer${buyerIndex}_abn`}
            value={buyer.abn}
            onChange={(e) => handleBuyerChange(buyerIndex, 'abn', e.target.value)}
            placeholder="12 345 678 901"
            required
            error={!!fieldErrors[`buyer${buyerIndex}_abn`]}
          />
          <InputField
            label="ACN"
            name={`buyer${buyerIndex}_acn`}
            value={buyer.acn}
            onChange={(e) => handleBuyerChange(buyerIndex, 'acn', e.target.value)}
            placeholder="123 456 789"
            required
            error={!!fieldErrors[`buyer${buyerIndex}_acn`]}
          />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <InputField
            label="Contact Email"
            name={`buyer${buyerIndex}_email`}
            type="email"
            value={buyer.email}
            onChange={(e) => handleBuyerChange(buyerIndex, 'email', e.target.value)}
            required
            error={!!fieldErrors[`buyer${buyerIndex}_email`]}
          />
          <InputField
            label="Contact Phone"
            name={`buyer${buyerIndex}_phone`}
            type="tel"
            value={buyer.phone}
            onChange={(e) => handleBuyerChange(buyerIndex, 'phone', e.target.value)}
            required
            error={!!fieldErrors[`buyer${buyerIndex}_phone`]}
          />
        </div>
        <InputField
          label="Entity Address"
          name={`buyer${buyerIndex}_address`}
          value={buyer.address}
          onChange={(e) => handleBuyerChange(buyerIndex, 'address', e.target.value)}
          required
          error={!!fieldErrors[`buyer${buyerIndex}_address`]}
        />
      </div>
    )}

    {/* Remove Buyer Button */}
    {formData.buyers.length > 1 && (
      <button
        type="button"
        onClick={() => removeBuyer(buyerIndex)}
        className="print:hidden mt-4 px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded text-sm font-bold flex items-center gap-2"
      >
        <Trash2 className="w-4 h-4" /> Remove Buyer {buyerIndex + 1}
      </button>
    )}
  </div>
))}


<SectionHeader icon={Briefcase} title="Buyer's Solicitor" id="solicitor" />

{/* Checkbox */}
<div className="mb-4">
  <Checkbox 
    label="Solicitor: To Be Advised" 
    name="solicitorToBeAdvised" 
    checked={formData.solicitorToBeAdvised} 
    onChange={handleChange}
  />
</div>

{/* Solicitor Fields */}
{!formData.solicitorToBeAdvised && (
<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
  <InputField
    label="Company Name"
    name="solicitorCompany"
    value={formData.solicitorCompany}
    onChange={handleChange}
    error={!!fieldErrors.solicitorCompany}
  />
  <InputField
    label="Contact Person"
    name="solicitorContact"
    value={formData.solicitorContact}
    onChange={handleChange}
    error={!!fieldErrors.solicitorContact}
  />
  <InputField
    label="Email"
    name="solicitorEmail"
    type="email"
    value={formData.solicitorEmail}
    onChange={handleChange}
    required
    error={!!fieldErrors.solicitorEmail}
  />
  <InputField
    label="Phone"
    name="solicitorPhone"
    type="tel"
    value={formData.solicitorPhone}
    onChange={handleChange}
    required
    error={!!fieldErrors.solicitorPhone}
  />
</div>
)}

<SectionHeader icon={DollarSign} title={features.showDeposits ? "Price & Deposit" : "Price"} id="price" />

<div className="mb-6">
  <InputField 
    label="Purchase Price Offer" 
    name="purchasePrice" 
    value={formData.purchasePrice} 
    onChange={handleChange} 
    placeholder={placeholders.purchasePrice || ''} 
    required 
    prefix="$" 
    error={!!fieldErrors.purchasePrice} 
  />
</div>

{features.showDeposits && (<>
<div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
  <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-sm">
    <h3 className="font-semibold text-slate-700 mb-3 text-xs uppercase tracking-[0.1em]">
      Initial Deposit (0.25%) Non Refundable
    </h3>
    <p className="text-xs text-slate-500 mb-2">0.25% of purchase price</p>
    {formData.purchasePrice ? (
      <div className="bg-white border border-slate-200 rounded px-3 py-2 text-lg font-bold text-slate-900 tabular-nums">
        ${formData.initialDeposit}
      </div>
    ) : (
      <div className="bg-white border border-slate-200 rounded px-3 py-2 text-sm text-slate-400 italic">
        Enter purchase price above
      </div>
    )}
    <p className="text-xs text-slate-500 mt-2 italic">Payable within 24 hours of offer being accepted</p>
  </div>

  <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-sm">
    <h3 className="font-semibold text-slate-700 mb-3 text-xs uppercase tracking-[0.1em]">
      Balance Deposit
    </h3>
    <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-[0.1em] mb-1.5 block">Deposit Percentage</label>
    <select
      name="balanceDepositPercent"
      value={formData.balanceDepositPercent}
      onChange={handleChange}
      className="w-full bg-white border border-slate-200 rounded-md px-3 py-2.5 text-sm focus:outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500/30 transition-colors mb-3"
    >
      <option value="5">5% of Purchase Price</option>
      <option value="10">10% of Purchase Price</option>
    </select>
    {formData.purchasePrice ? (
      <div className="bg-white border border-slate-200 rounded px-3 py-2 text-lg font-bold text-slate-900 tabular-nums">
        ${formData.balanceDeposit}
      </div>
    ) : (
      <div className="bg-white border border-slate-200 rounded px-3 py-2 text-sm text-slate-400 italic">
        Enter purchase price above
      </div>
    )}
    <p className="text-xs text-slate-500 mt-2 mb-3 italic">
      Payable before expiration of Cooling Off Period
    </p>
    <InputField
      label="Terms"
      name="balanceDepositTerms"
      value={formData.balanceDepositTerms}
      onChange={handleChange}
      placeholder="Special conditions (if any)"
    />
  </div>
</div>

{(formData.initialDeposit || formData.balanceDeposit) && (
  <div className="bg-slate-900 rounded-xl p-4 mb-6">
    <div className="flex justify-between items-center">
      <span className="font-semibold text-white text-sm">Total Deposit</span>
      <span className="text-xl font-bold text-white tabular-nums">
        ${((parseFloat(String(formData.initialDeposit).replace(/[^0-9.]/g, '')) || 0) +
           (parseFloat(String(formData.balanceDeposit).replace(/[^0-9.]/g, '')) || 0)).toLocaleString()}
      </span>
    </div>
    <p className="text-xs text-slate-400 mt-1 tabular-nums">
      Initial ${(parseFloat(String(formData.initialDeposit).replace(/[^0-9.]/g, '')) || 0).toLocaleString()} +
      Balance ${(parseFloat(String(formData.balanceDeposit).replace(/[^0-9.]/g, '')) || 0).toLocaleString()}
    </p>
  </div>
)}
</>)}

          <SectionHeader icon={Calendar} title="Conditions" id="conditions" />
          <div className={`grid grid-cols-1 ${features.showBuildingPest ? 'md:grid-cols-2' : ''} gap-6 mb-6`}>
            <div className="p-4 bg-slate-50 border border-slate-200 rounded">
              <h3 className="font-bold text-slate-700 mb-3 text-sm">{features.showFinance ? 'Finance' : 'Cooling Off'}</h3>
              {features.showFinance && (<>
              <InputField label="Finance Date" name="financeDate" value={formData.financeDate} onChange={handleChange} placeholder={placeholders.financeDate || ''} className="mb-3" />
              <Checkbox label="Loan Pre-Approved?" name="financePreApproved" checked={formData.financePreApproved} onChange={handleChange} />
              </>)}
              <label className={`text-xs font-bold text-slate-500 uppercase mb-1 block ${features.showFinance ? 'mt-3' : ''}`}>Cooling Off Period</label>
              <select
                name="coolingOffPeriod"
                value={formData.coolingOffPeriod}
                onChange={handleChange}
                className="w-full border border-slate-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-600 transition-colors mb-3"
              >
                <option value="5">5-Day (Business Days)</option>
                <option value="10">10-Day (Business Days)</option>
              </select>
              <Checkbox label="Waiver of Cooling Off Period" name="waiverCoolingOff" checked={formData.waiverCoolingOff} onChange={handleChange} />
            </div>
            {features.showBuildingPest && (
            <div className="p-4 bg-slate-50 border border-slate-200 rounded">
              <h3 className="font-bold text-slate-700 mb-3 text-sm">Building & Pest</h3>
              <InputField label="Inspection Date" name="inspectionDate" value={formData.inspectionDate} onChange={handleChange} placeholder={placeholders.inspectionDate || ''} />
            </div>
            )}
          </div>
          <InputField label="Settlement Date" name="settlementDate" value={formData.settlementDate} onChange={handleChange} placeholder={placeholders.settlementDate || ''} />

          <div className="mt-6">
            <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">Special Conditions</label>
            <textarea name="specialConditions" value={formData.specialConditions} onChange={handleChange} rows={4} className="w-full border border-slate-300 rounded p-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-600 transition-colors" placeholder={placeholders.specialConditions || ''}></textarea>
          </div>


{/* DISCLAIMER SECTION */}
<div className="bg-amber-50 border-2 border-amber-400 rounded-lg p-6 mt-12 mb-8 print:bg-white print:border print:border-slate-300">
  <div className="flex items-start gap-3">
    <div className="bg-amber-100 p-2 rounded-full text-amber-600 flex-shrink-0 print:bg-slate-100 print:text-slate-600">
      <AlertTriangle className="w-6 h-6" />
    </div>
    <div>
      <h3 className="font-bold text-amber-900 text-lg mb-2 print:text-slate-800">Important Disclaimer</h3>
      <p className="text-sm text-amber-800 leading-relaxed print:text-slate-700">
        The signing of this document does not create a legally binding agreement. It neither obligates the Vendor to sell
        the property nor the purchaser to buy the property and the purchaser may withdraw this offer at any time prior to
        formal exchange of Contracts for Sale. As such the property will not be taken off the market until such times as
        contracts have exchanged. The purchaser should make every endeavour to expedite the exchange of contracts which is
        the only way to guarantee the purchase.
      </p>
    </div>
  </div>
</div>

         {/* SIGNATURES SECTION */}
<div id="section-signature" className="mt-12 mb-8 break-inside-avoid scroll-mt-24 lg:scroll-mt-8">
  <div className="flex items-center justify-between border-b border-slate-300 pb-2 mb-5">
    <div className="flex items-center gap-2">
      <PenTool className="w-4 h-4 text-red-600" />
      <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Authorisation</h2>
    </div>
  </div>
  
  <div className={`grid grid-cols-1 ${formData.buyers.length > 1 ? 'md:grid-cols-2' : ''} gap-8`}>
    {formData.buyers.map((buyer, index) => (
      <div key={index} className="flex flex-col h-full justify-between">
        <div>
          <label className="text-xs font-bold text-slate-500 uppercase mb-2 block">
            Buyer {index + 1} Signature <span className="text-red-500">*</span>
          </label>
          <div className="print:hidden">
            <EnhancedSignaturePad 
              signatureData={buyer.signature} 
              onEnd={(data) => handleSignatureEnd(index, data)} 
              onClear={() => handleSignatureClear(index)} 
              error={!!fieldErrors[`buyer${index}_signature`]} 
              label="Tap or click here to sign"
            />
          </div>
          <div className="hidden print:block h-32 border-b border-slate-300 relative">
            {buyer.signature && (
              <img src={buyer.signature} alt={`Signature ${index + 1}`} className="h-full object-contain absolute bottom-0 left-0" />
            )}
          </div>
        </div>
        <div className="mt-4">
          <InputField 
            label="Date" 
            name={`buyer${index}_signatureDate`} 
            type="date" 
            value={buyer.signatureDate} 
            onChange={(e) => handleBuyerChange(index, 'signatureDate', e.target.value)} 
          />
        </div>
      </div>
    ))}
  </div>
</div>

          <div className="mt-8 flex justify-end print:hidden">
            <button type="submit" disabled={isSubmitting} className={`flex items-center gap-2 px-10 py-3.5 rounded-full text-white font-bold tracking-wide transition-shadow ${isSubmitting ? 'bg-slate-400 cursor-not-allowed shadow-none' : 'bg-red-600 hover:bg-red-700 shadow-[0_4px_24px_rgba(220,38,38,0.35)] hover:shadow-[0_6px_28px_rgba(220,38,38,0.45)]'}`}>
              {isSubmitting ? 'Sending...' : <>Submit Offer <Send className="w-4 h-4" /></>}
            </button>
          </div>
        </form>
      </div>
      <div className="max-w-4xl mx-auto py-8 text-center text-slate-400 text-xs print:hidden lg:ml-56"><p>&copy; {new Date().getFullYear()} PRD Dapto. Powered by Online Offer Form.</p></div>
    </div>
  );
}
