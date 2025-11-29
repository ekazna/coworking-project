from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.models import User

from rest_framework import status, viewsets, permissions, serializers, mixins
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAuthenticated, IsAdminUser
from rest_framework.authtoken.models import Token
from rest_framework.authentication import TokenAuthentication

from .models import UserProfile, UserNotificationSettings
from .serializers import UserAdminSerializer, UserMeSerializer, AdminUserProfileSerializer
from django.shortcuts import get_object_or_404


# ------------------ РЕГИСТРАЦИЯ ------------------ #
class RegisterView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []   # логин/рег без токенов

    def post(self, request):
        username = request.data.get("username")
        email = request.data.get("email")
        password = request.data.get("password")

        if not username or not password:
            return Response(
                {"error": "username and password required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if User.objects.filter(username=username).exists():
            return Response(
                {"error": "User already exists"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user = User.objects.create_user(
            username=username,
            password=password,
            email=email,
        )

        token, _ = Token.objects.get_or_create(user=user)

        return Response(
            {
                "token": token.key,
                "username": user.username,
                "is_staff": user.is_staff,
            },
            status=status.HTTP_201_CREATED,
        )


# ------------------ ЛОГИН ------------------ #
class LoginView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []   # логин без токенов

    def post(self, request):
        username = request.data.get("username")
        password = request.data.get("password")

        if not username or not password:
            return Response(
                {"error": "username and password required"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user = authenticate(username=username, password=password)
        if not user:
            return Response(
                {"error": "Неверный логин или пароль"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        login(request, user)

        token, _ = Token.objects.get_or_create(user=user)

        return Response(
            {
                "token": token.key,
                "username": user.username,
                "is_staff": user.is_staff,
            },
            status=status.HTTP_200_OK,
        )


# ------------------ ЛОГАУТ ------------------ #
class LogoutView(APIView):
    permission_classes = [IsAuthenticated]
    authentication_classes = [TokenAuthentication]

    def post(self, request):
        try:
            token = Token.objects.get(user=request.user)
            token.delete()
        except Token.DoesNotExist:
            pass

        logout(request)
        return Response({"message": "Logged out"}, status=status.HTTP_200_OK)


# ---------- Админский просмотр/редактирование пользователей ---------- #

class UserAdminViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,   # даёт PUT и PATCH
    viewsets.GenericViewSet,
):
    """
    API для администратора:
    - список пользователей
    - детали по одному пользователю
    - редактирование пользователя (PUT/PATCH)
    """
    queryset = User.objects.all().order_by("id")
    serializer_class = UserAdminSerializer
    permission_classes = [permissions.IsAdminUser]

    # Явно ограничим методы: ни POST, ни DELETE
    http_method_names = ["get", "put", "patch", "head", "options"]

class AdminUserDetailView(APIView):
    """
    Детальный профиль произвольного пользователя для админа:
    - GET /api/users/<user_id>/admin-detail/
    - PUT/PATCH /api/users/<user_id>/admin-detail/
    """
    permission_classes = [IsAdminUser]

    def get_object(self, user_id):
        return get_object_or_404(User, pk=user_id)

    def get(self, request, user_id):
        user = self.get_object(user_id)
        serializer = AdminUserProfileSerializer(user)
        return Response(serializer.data)

    def put(self, request, user_id):
        user = self.get_object(user_id)
        serializer = AdminUserProfileSerializer(user, data=request.data, partial=False)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    def patch(self, request, user_id):
        user = self.get_object(user_id)
        serializer = AdminUserProfileSerializer(user, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)


# ---------- Профиль текущего пользователя /api/users/me/ ---------- #

class UserMeView(APIView):
    """
    GET  /api/users/me/  — получить профиль текущего пользователя
    PUT  /api/users/me/  — обновить профиль
    """
    permission_classes = [IsAuthenticated]

    def _get_bundle(self, user):
        profile, _ = UserProfile.objects.get_or_create(user=user)
        settings, _ = UserNotificationSettings.objects.get_or_create(user=user)
        return {"user": user, "profile": profile, "settings": settings}

    def get(self, request):
        bundle = self._get_bundle(request.user)
        serializer = UserMeSerializer(bundle)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def put(self, request):
        bundle = self._get_bundle(request.user)
        serializer = UserMeSerializer(bundle, data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_200_OK)

    def patch(self, request):
        bundle = self._get_bundle(request.user)
        serializer = UserMeSerializer(bundle, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data, status=status.HTTP_200_OK)
    
class ChangePasswordView(APIView):
    permission_classes = [IsAuthenticated]
    authentication_classes = [TokenAuthentication]

    def post(self, request):
        user = request.user
        old_password = request.data.get("old_password")
        new_password1 = request.data.get("new_password1")
        new_password2 = request.data.get("new_password2")

        if not old_password or not new_password1 or not new_password2:
            return Response(
                {"detail": "Все поля обязательны."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not user.check_password(old_password):
            return Response(
                {"detail": "Текущий пароль указан неверно."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if new_password1 != new_password2:
            return Response(
                {"detail": "Новые пароли не совпадают."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if len(new_password1) < 8:
            return Response(
                {"detail": "Новый пароль должен содержать не менее 8 символов."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user.set_password(new_password1)
        user.save()

        return Response(
            {"detail": "Пароль успешно изменён."},
            status=status.HTTP_200_OK,
        )
