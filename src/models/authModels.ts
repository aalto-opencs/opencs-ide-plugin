export interface StudentProfile {
  id: string;
  name: string;
}

export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  student: StudentProfile;
}