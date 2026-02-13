// Database Types for Inventory Management System

// Department Categories
export type DepartmentCategory = 'production' | 'indirect' | 'other';

// User Roles
export type UserRole =
    | 'admin_produksi'   // Manages Molding, Plating, Painting 1, Painting 2
    | 'admin_indirect'   // Manages PP, QC, QA, PPIC Logistics
    | 'admin_dept'       // Self-service for Sales, IT, GA, Finance
    | 'supervisor'       // Department approval
    | 'hrga';            // Master Stock, OCR, Batch approval, Reports

// Request Status
export type RequestStatus =
    | 'pending'          // Awaiting supervisor approval
    | 'approved_spv'     // Approved by supervisor, ready for batch
    | 'rejected'         // Rejected by supervisor
    | 'scheduled'        // Added to pickup batch
    | 'completed';       // Items distributed

// HRGA Batch Status
export type BatchStatus = 'pending' | 'approved' | 'rejected';

// Department
export interface Department {
    id: string;
    code: string;
    name: string;
    category: DepartmentCategory;
    created_at: string;
}

// User-Department Junction (for multi-department support)
export interface UserDepartment {
    id: string;
    user_id: string;
    department_id: string;
    is_primary: boolean;
    department?: Department;
    created_at: string;
}

// User Profile (linked to Supabase Auth)
export interface Profile {
    id: string;
    email: string;
    username?: string | null;
    full_name: string | null;
    role: UserRole;
    department_id: string | null; // Deprecated, kept for backward compatibility
    department?: Department; // Deprecated, use departments instead
    departments?: Department[]; // NEW: Array of departments for multi-department support
    user_departments?: UserDepartment[]; // NEW: Full user-department relations
    created_at: string;
}

// Inventory Item
export interface Item {
    id: string;
    name: string;
    sku: string;
    unit: string;
    current_stock: number;
    min_stock: number;
    created_at: string;
}

// Request (procurement request)
export interface Request {
    id: string;
    doc_number: string;
    requester_id: string;
    dept_code: string;
    status: RequestStatus;
    rejection_reason: string | null;
    batch_id: string | null;
    admin_signature_url: string | null;
    spv_signature_url: string | null;
    created_at: string;
    updated_at: string;
    // Relations
    requester?: Profile;
    department?: Department;
    items?: RequestItem[];
    batch?: PickupBatch;
}

// Request Item (junction table)
export interface RequestItem {
    id: string;
    request_id: string;
    item_id: string;
    quantity: number;
    // Relations
    item?: Item;
}

// Pickup Batch
export interface PickupBatch {
    id: string;
    schedule_date: string;
    hrga_status: BatchStatus;
    hrga_signature_url: string | null;
    created_at: string;
    // Relations
    requests?: Request[];
}

// Notification
export interface Notification {
    id: string;
    user_id: string;
    message: string;
    is_read: boolean;
    link: string | null;
    created_at: string;
}

// Document Number Sequence (for tracking unique doc numbers per dept/year)
export interface DocSequence {
    id: string;
    dept_code: string;
    year: number;
    last_number: number;
}

// Form Types for Creating/Updating

export interface CreateRequestInput {
    dept_code: string;
    items: {
        item_id: string;
        quantity: number;
    }[];
    admin_signature?: string; // Base64 signature data
}

export interface ApprovalInput {
    request_id: string;
    approved: boolean;
    rejection_reason?: string;
    spv_signature?: string; // Base64 signature data
}

export interface CreateBatchInput {
    request_ids: string[];
    schedule_date: string;
}

export interface BatchApprovalInput {
    batch_id: string;
    approved: boolean;
    schedule_date?: string; // HRGA can modify date
    hrga_signature?: string; // Base64 signature data
}

// OCR Verification
export interface OcrVerificationInput {
    batch_id: string;
    items: {
        item_id: string;
        verified_quantity: number;
    }[];
}

// Incoming Stock
export interface IncomingStock {
    id: string;
    po_number: string;
    incoming_date: string;
    notes?: string | null;
    created_by: string;
    created_at: string;
    updated_at: string;
}

// Incoming Stock Item
export interface IncomingStockItem {
    id: string;
    incoming_id: string;
    item_id: string;
    quantity: number;
    created_at: string;
    item?: Item;
}

// Role-Department Mapping - Must match database department codes!
export const PRODUCTION_DEPARTMENTS = ['MLD', 'PLA', 'PA', 'PB'] as const;
export const INDIRECT_DEPARTMENTS = ['Assembly', 'PP', 'QC', 'QA', 'PPIC'] as const;
export const OTHER_DEPARTMENTS = ['SALES', 'IT', 'GA', 'FAC'] as const;

export type ProductionDept = typeof PRODUCTION_DEPARTMENTS[number];
export type IndirectDept = typeof INDIRECT_DEPARTMENTS[number];
export type OtherDept = typeof OTHER_DEPARTMENTS[number];
