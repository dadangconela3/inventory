'use client';

import { useState, useRef, useEffect, useCallback } from 'react';

export interface SelectOption {
    value: string;
    label: string;
}

interface CreatableSelectProps {
    options: SelectOption[];
    value: string;
    onChange: (value: string, isNew?: boolean) => void;
    onCreateNew?: (inputValue: string) => Promise<SelectOption | null>;
    placeholder?: string;
    label?: string;
    required?: boolean;
    disabled?: boolean;
    createLabel?: string;
}

export default function CreatableSelect({
    options,
    value,
    onChange,
    onCreateNew,
    placeholder = 'Pilih atau ketik...',
    label,
    required = false,
    disabled = false,
    createLabel = 'Tambah baru',
}: CreatableSelectProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [inputValue, setInputValue] = useState('');
    const [filteredOptions, setFilteredOptions] = useState<SelectOption[]>(options);
    const [highlightIndex, setHighlightIndex] = useState(-1);
    const [isCreating, setIsCreating] = useState(false);

    const containerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Get selected option label
    const selectedOption = options.find(opt => opt.value === value);
    const displayValue = selectedOption?.label || '';

    // Filter options based on input
    useEffect(() => {
        if (inputValue.trim()) {
            const filtered = options.filter(opt =>
                opt.label.toLowerCase().includes(inputValue.toLowerCase())
            );
            setFilteredOptions(filtered);
        } else {
            setFilteredOptions(options);
        }
        setHighlightIndex(-1);
    }, [inputValue, options]);

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
                setInputValue('');
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setInputValue(e.target.value);
        if (!isOpen) setIsOpen(true);
    };

    const handleFocus = () => {
        setIsOpen(true);
        setInputValue('');
    };

    const handleSelect = (option: SelectOption) => {
        onChange(option.value, false);
        setInputValue('');
        setIsOpen(false);
        inputRef.current?.blur();
    };

    const handleCreateNew = async () => {
        if (!onCreateNew || !inputValue.trim()) return;

        setIsCreating(true);
        try {
            const newOption = await onCreateNew(inputValue.trim());
            if (newOption) {
                onChange(newOption.value, true);
                setInputValue('');
                setIsOpen(false);
            }
        } catch (error) {
            console.error('Error creating new option:', error);
        } finally {
            setIsCreating(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Escape') {
            setIsOpen(false);
            setInputValue('');
            return;
        }

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setHighlightIndex(prev => Math.min(prev + 1, filteredOptions.length - 1));
        }

        if (e.key === 'ArrowUp') {
            e.preventDefault();
            setHighlightIndex(prev => Math.max(prev - 1, -1));
        }

        if (e.key === 'Enter') {
            e.preventDefault();
            if (highlightIndex >= 0 && filteredOptions[highlightIndex]) {
                handleSelect(filteredOptions[highlightIndex]);
            } else if (filteredOptions.length === 0 && inputValue.trim() && onCreateNew) {
                handleCreateNew();
            }
        }
    };

    const showCreateOption = inputValue.trim() &&
        !filteredOptions.some(opt => opt.label.toLowerCase() === inputValue.toLowerCase()) &&
        onCreateNew;

    return (
        <div ref={containerRef} className="relative">
            {label && (
                <label className="mb-1.5 block text-sm font-medium text-slate-600 dark:text-navy-100">
                    {label} {required && <span className="text-error">*</span>}
                </label>
            )}

            <div className="relative">
                <input
                    ref={inputRef}
                    type="text"
                    value={isOpen ? inputValue : displayValue}
                    onChange={handleInputChange}
                    onFocus={handleFocus}
                    onKeyDown={handleKeyDown}
                    placeholder={placeholder}
                    disabled={disabled}
                    className="form-input w-full rounded-lg border border-slate-300 bg-transparent px-3 py-2 pr-10 placeholder:text-slate-400/70 focus:border-primary dark:border-navy-450 dark:focus:border-accent"
                />

                {/* Dropdown Arrow */}
                <button
                    type="button"
                    onClick={() => {
                        if (!disabled) {
                            setIsOpen(!isOpen);
                            if (!isOpen) {
                                inputRef.current?.focus();
                            }
                        }
                    }}
                    disabled={disabled}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 dark:text-navy-300"
                >
                    <svg
                        className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                    >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                </button>
            </div>

            {/* Dropdown Menu */}
            {isOpen && (
                <div className="absolute z-[9999] mt-1 max-h-60 w-full overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg dark:border-navy-500 dark:bg-navy-700">
                    {filteredOptions.length === 0 && !showCreateOption ? (
                        <div className="px-4 py-3 text-sm text-slate-400 dark:text-navy-300">
                            Tidak ditemukan
                        </div>
                    ) : (
                        <>
                            {filteredOptions.map((option, index) => (
                                <button
                                    key={option.value}
                                    type="button"
                                    onClick={() => handleSelect(option)}
                                    className={`w-full px-4 py-2.5 text-left text-sm transition-colors ${highlightIndex === index || option.value === value
                                        ? 'bg-primary/10 text-primary dark:bg-accent/10 dark:text-accent-light'
                                        : 'text-slate-700 hover:bg-slate-100 dark:text-navy-100 dark:hover:bg-navy-600'
                                        }`}
                                >
                                    {option.label}
                                    {option.value === value && (
                                        <svg className="ml-2 inline h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                        </svg>
                                    )}
                                </button>
                            ))}

                            {/* Create New Option */}
                            {showCreateOption && (
                                <button
                                    type="button"
                                    onClick={handleCreateNew}
                                    disabled={isCreating}
                                    className="flex w-full items-center gap-2 border-t border-slate-100 px-4 py-2.5 text-left text-sm text-primary hover:bg-primary/10 dark:border-navy-600 dark:text-accent-light dark:hover:bg-accent/10"
                                >
                                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                    </svg>
                                    {isCreating ? 'Menambahkan...' : `${createLabel}: "${inputValue}"`}
                                </button>
                            )}
                        </>
                    )}
                </div>
            )}
        </div>
    );
}
