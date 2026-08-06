export interface StudentProfile {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
}

export interface AuthSession {
  token: string;
  student: StudentProfile;
}

export interface VscodeLoginResponse {
  auth: true;
  token: string;
  email: string;
  id: number;
  firstName: string;
  lastName: string;
  verified: string | null;
  isAnon: false;
  admin?: boolean;
}
