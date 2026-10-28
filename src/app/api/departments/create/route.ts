import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { name, code: customCode, category = 'other' } = body;

        const trimmedName = typeof name === 'string' ? name.trim() : '';
        if (!trimmedName) {
            return NextResponse.json(
                { error: 'Nama departemen harus diisi' },
                { status: 400 }
            );
        }

        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

        if (!supabaseUrl || !serviceKey) {
            return NextResponse.json(
                { error: 'Konfigurasi server Supabase tidak lengkap' },
                { status: 500 }
            );
        }

        const supabaseAdmin = createClient(supabaseUrl, serviceKey);

        // Verify HRGA authorization if token is present
        const authHeader = request.headers.get('Authorization');
        const token = authHeader?.replace('Bearer ', '');

        if (token) {
            const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
            if (authError || !user) {
                return NextResponse.json(
                    { error: 'Sesi login tidak valid' },
                    { status: 401 }
                );
            }

            const { data: profile } = await supabaseAdmin
                .from('profiles')
                .select('role')
                .eq('id', user.id)
                .single();

            if (profile && profile.role !== 'hrga') {
                return NextResponse.json(
                    { error: 'Hanya role HRGA yang dapat membuat departemen baru' },
                    { status: 403 }
                );
            }
        }

        // Check if a department with this name already exists
        const { data: existingByName } = await supabaseAdmin
            .from('departments')
            .select('*')
            .ilike('name', trimmedName)
            .maybeSingle();

        if (existingByName) {
            return NextResponse.json({
                success: true,
                department: existingByName,
                isExisting: true,
            });
        }

        // Generate department code from input
        let baseCode = (customCode || trimmedName)
            .toUpperCase()
            .replace(/[^A-Z0-9]/g, '_')
            .replace(/_+/g, '_')
            .replace(/^_|_$/g, '')
            .slice(0, 30);

        if (!baseCode) {
            baseCode = `DEPT_${Date.now().toString(36).toUpperCase()}`;
        }

        // Ensure code uniqueness
        let uniqueCode = baseCode;
        let counter = 1;
        while (true) {
            const { data: existingCode } = await supabaseAdmin
                .from('departments')
                .select('id')
                .eq('code', uniqueCode)
                .maybeSingle();

            if (!existingCode) {
                break;
            }
            counter++;
            uniqueCode = `${baseCode.slice(0, 25)}_${counter}`;
        }

        // Insert new department
        const { data: newDept, error: insertError } = await supabaseAdmin
            .from('departments')
            .insert({
                code: uniqueCode,
                name: trimmedName,
                category: category || 'other',
            })
            .select()
            .single();

        if (insertError) {
            console.error('Error inserting department:', insertError);
            return NextResponse.json(
                { error: insertError.message || 'Gagal membuat departemen baru' },
                { status: 500 }
            );
        }

        return NextResponse.json({
            success: true,
            department: newDept,
            isExisting: false,
        });
    } catch (error: any) {
        console.error('API create department error:', error);
        return NextResponse.json(
            { error: error?.message || 'Terjadi kesalahan saat membuat departemen' },
            { status: 500 }
        );
    }
}
