from rest_framework import serializers
from .models import ResourceCategory, ResourceType, Resource


class ResourceCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = ResourceCategory
        fields = ["id", "code", "name"]


class ResourceTypeSerializer(serializers.ModelSerializer):
    category = ResourceCategorySerializer(read_only=True)
    category_id = serializers.PrimaryKeyRelatedField(
        source="category", queryset=ResourceCategory.objects.all(), write_only=True
    )

    class Meta:
        model = ResourceType
        fields = [
            "id",
            "category",
            "category_id",
            "name",
            "description",
            "hourly_rate",
            "daily_rate",
            "monthly_rate",
        ]


class ResourceSerializer(serializers.ModelSerializer):
    type = ResourceTypeSerializer(read_only=True)
    type_id = serializers.PrimaryKeyRelatedField(
        source="type", queryset=ResourceType.objects.all(), write_only=True
    )

    class Meta:
        model = Resource
        fields = [
            "id",
            "type",
            "type_id",
            "name",
            "zone",
            "capacity",
            "status",
            "description",
        ]
