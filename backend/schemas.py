"""Pydantic schemas — xác thực dữ liệu vào/ra API, áp các Business Rules (BR1-BR8)."""
from typing import Literal, Optional

from pydantic import BaseModel, EmailStr, Field, field_validator

TxnType = Literal["income", "expense"]


class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
    full_name: Optional[str] = None


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    id: int
    email: str
    full_name: Optional[str] = None
    created_at: Optional[str] = None


class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    email: Optional[EmailStr] = None


class PasswordChange(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8)


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class CategoryCreate(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    type: TxnType
    icon: Optional[str] = None
    color: Optional[str] = None


class CategoryOut(CategoryCreate):
    id: int


class TransactionCreate(BaseModel):
    category_id: int
    amount: float
    type: TxnType
    txn_date: str
    note: Optional[str] = None
    account: Optional[str] = None

    @field_validator("amount")
    @classmethod
    def amount_must_be_positive(cls, v):
        # BR1 — Khoản thu/chi phải có số tiền lớn hơn 0
        if v <= 0:
            raise ValueError("Số tiền phải lớn hơn 0")
        return v

    @field_validator("txn_date")
    @classmethod
    def date_required(cls, v):
        # BR2 — Giao dịch phải có ngày phát sinh
        if not v or not v.strip():
            raise ValueError("Giao dịch phải có ngày phát sinh")
        return v


class TransactionUpdate(BaseModel):
    category_id: Optional[int] = None
    amount: Optional[float] = None
    type: Optional[TxnType] = None
    txn_date: Optional[str] = None
    note: Optional[str] = None
    account: Optional[str] = None

    @field_validator("amount")
    @classmethod
    def amount_must_be_positive(cls, v):
        if v is not None and v <= 0:
            raise ValueError("Số tiền phải lớn hơn 0")
        return v


class TransactionOut(BaseModel):
    id: int
    category_id: int
    amount: float
    type: TxnType
    txn_date: str
    note: Optional[str] = None
    account: Optional[str] = None
    created_at: Optional[str] = None


class BudgetCreate(BaseModel):
    category_id: int
    month: int = Field(ge=1, le=12)
    year: int = Field(ge=2000, le=2100)
    limit_amount: float

    @field_validator("limit_amount")
    @classmethod
    def limit_non_negative(cls, v):
        # BR4 — Số tiền ngân sách phải >= 0
        if v < 0:
            raise ValueError("Hạn mức ngân sách phải lớn hơn hoặc bằng 0")
        return v


class BudgetOut(BaseModel):
    id: int
    category_id: int
    month: int
    year: int
    limit_amount: float
    spent: float = 0
    used_pct: float = 0


class GoalCreate(BaseModel):
    name: str = Field(min_length=1)
    target_amount: float
    saved_amount: float = 0
    deadline: str
    emoji: Optional[str] = None
    note: Optional[str] = None
    priority: Optional[str] = None

    @field_validator("target_amount")
    @classmethod
    def target_positive(cls, v):
        # BR6 — Số tiền mục tiêu phải được xác định và > 0
        if v <= 0:
            raise ValueError("Số tiền mục tiêu phải lớn hơn 0")
        return v

    @field_validator("deadline")
    @classmethod
    def deadline_required(cls, v):
        # BR6 — Thời hạn phải được xác định
        if not v or not v.strip():
            raise ValueError("Mục tiêu phải có hạn hoàn thành")
        return v


class GoalUpdate(BaseModel):
    name: Optional[str] = None
    target_amount: Optional[float] = None
    saved_amount: Optional[float] = None
    deadline: Optional[str] = None
    emoji: Optional[str] = None
    note: Optional[str] = None
    priority: Optional[str] = None


class GoalOut(BaseModel):
    id: int
    name: str
    target_amount: float
    saved_amount: float
    deadline: Optional[str] = None
    emoji: Optional[str] = None
    note: Optional[str] = None
    priority: Optional[str] = None
    created_at: Optional[str] = None


class AIQuestion(BaseModel):
    question: str = Field(min_length=1)


class AIResponse(BaseModel):
    text: str
    data: Optional[dict] = None
    disclaimer: str = "Đây là gợi ý tham khảo do AI tạo ra dựa trên dữ liệu của bạn, không thay thế tư vấn tài chính chuyên nghiệp."
