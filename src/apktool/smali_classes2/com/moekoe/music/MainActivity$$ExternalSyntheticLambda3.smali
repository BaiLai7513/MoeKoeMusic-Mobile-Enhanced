.class public final synthetic Lcom/moekoe/music/MainActivity$$ExternalSyntheticLambda3;
.super Ljava/lang/Object;
.source "D8$$SyntheticClass"

# interfaces
.implements Ljava/lang/Runnable;


# instance fields
.field public final synthetic f$0:Ljava/lang/String;

.field public final synthetic f$1:Landroid/webkit/WebView;


# direct methods
.method public synthetic constructor <init>(Ljava/lang/String;Landroid/webkit/WebView;)V
    .locals 0

    invoke-direct {p0}, Ljava/lang/Object;-><init>()V

    iput-object p1, p0, Lcom/moekoe/music/MainActivity$$ExternalSyntheticLambda3;->f$0:Ljava/lang/String;

    iput-object p2, p0, Lcom/moekoe/music/MainActivity$$ExternalSyntheticLambda3;->f$1:Landroid/webkit/WebView;

    return-void
.end method


# virtual methods
.method public final run()V
    .locals 2

    iget-object v0, p0, Lcom/moekoe/music/MainActivity$$ExternalSyntheticLambda3;->f$0:Ljava/lang/String;

    iget-object v1, p0, Lcom/moekoe/music/MainActivity$$ExternalSyntheticLambda3;->f$1:Landroid/webkit/WebView;

    invoke-static {v0, v1}, Lcom/moekoe/music/MainActivity;->lambda$sendMediaCommand$3(Ljava/lang/String;Landroid/webkit/WebView;)V

    return-void
.end method
