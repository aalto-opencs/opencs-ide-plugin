export interface StudentProfile {
  id: number;
  email: string;
}

export interface AuthSession {
  token: string;
  student: StudentProfile;
}

export interface PlatformLoginResponse {
  token: string;
  id: number;
  email: string;
}
